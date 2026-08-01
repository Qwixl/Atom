import type { Express } from "express";
import { createAtomPeerClient } from "@qwixl/a2a-transport";
import {
  createRoomActivity,
  createRoomMessage,
  createRoomMutation,
  createRoomReceipt,
  roomObjectChainHash,
  sendMlsWire,
  verifyRoomInvite,
  verifyRoomObject,
  verifyRoomReceipt,
  verifyRoomCheckpoint,
  ROOM_ACTIVITY_PURPOSE,
  ROOM_MESSAGE_PURPOSE,
  ROOM_MUTATION_PURPOSE,
  type VerifiedRoomObject,
} from "@qwixl/a2a-transport";
import { base64ToBytes, ReplayGuard, type DataObject } from "@qwixl/protocol";
import type { AgentKeyPair } from "@qwixl/protocol";
import {
  adminBaseFromPeerUrl,
  encodeRoomObject,
  parseRoomPayload,
  roomContextId,
  type MlsSessionStore,
} from "./mlsSessions.js";
import {
  admitChainLink,
  createRoomChainTracker,
  type RoomChainTracker,
  type RoomChainVerdict,
} from "./roomChain.js";
import { normalizePeerBaseUrl } from "./deliverObject.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import { joinRemoteRoom } from "./roomJoinRemote.js";
import { normalizeActivities } from "./roomActivities.js";
import {
  ATOM_BASE_ROOM_POLICY_URL,
  type RoomContinuity,
  type RoomDescriptor,
  type RoomMessage,
  type RoomStore,
} from "./roomStore.js";
import { reconcileHostTranscript } from "./roomReconcile.js";
import { mintRoomCheckpoint } from "./roomCheckpoint.js";

/**
 * Per-sender chain trackers. Accepted positions persist in the room store; the
 * out-of-order buffer is deliberately in-memory only, because anything still
 * buffered at shutdown is recoverable from host backfill on the next read.
 */
const chainTrackers = new Map<string, RoomChainTracker>();

/**
 * Verified objects whose chain link is buffered ahead of a gap, held until the
 * gap fills and the classifier releases them. Keyed by object id, which is the
 * only handle the classifier carries.
 */
const pendingRoomObjects = new Map<
  string,
  { verified: ChainedRoomObject; fields: ReturnType<typeof roomObjectFields> }
>();

/**
 * The classifier evicts its own buffer, but it cannot tell us what it dropped,
 * so this table would otherwise grow without bound behind a gap that never
 * fills. Insertion order is arrival order, so the oldest entry is the one whose
 * predecessors are least likely to still be coming.
 */
const PENDING_OBJECT_LIMIT = 500;

function stashPendingObject(
  objectId: string,
  entry: { verified: ChainedRoomObject; fields: ReturnType<typeof roomObjectFields> },
): void {
  pendingRoomObjects.set(objectId, entry);
  while (pendingRoomObjects.size > PENDING_OBJECT_LIMIT) {
    const oldest = pendingRoomObjects.keys().next();
    if (oldest.done) break;
    pendingRoomObjects.delete(oldest.value);
  }
}

function trackerFor(rooms: RoomStore, roomId: string, senderDid: string): RoomChainTracker {
  const key = `${roomId}\u0000${senderDid}`;
  let tracker = chainTrackers.get(key);
  if (!tracker) {
    const persisted = rooms.chainState(roomId).recv.find((r) => r.senderDid === senderDid);
    tracker = createRoomChainTracker(
      senderDid,
      persisted ? { n: persisted.n, hash: persisted.hash } : undefined,
    );
    chainTrackers.set(key, tracker);
  }
  return tracker;
}

/** Test seam: chain buffers are process-local, so suites must be able to reset them. */
export function resetRoomChainTrackers(): void {
  chainTrackers.clear();
  pendingRoomObjects.clear();
}

function continuityOf(verdict: RoomChainVerdict): RoomContinuity {
  switch (verdict.status) {
    case "ok":
      return "ok";
    case "pending":
      return "pending";
    case "fork":
      return "fork";
    default:
      return "ok";
  }
}

/**
 * Only these three purposes carry a per-sender chain position, so only these
 * three may enter a transcript. Moderation and member updates are host-authored
 * control objects that ride their own route.
 */
type ChainedRoomObject = Extract<
  VerifiedRoomObject,
  { purpose: typeof ROOM_MESSAGE_PURPOSE | typeof ROOM_ACTIVITY_PURPOSE | typeof ROOM_MUTATION_PURPOSE }
>;

function asChainedRoomObject(verified: VerifiedRoomObject): ChainedRoomObject {
  if (
    verified.purpose === ROOM_MESSAGE_PURPOSE ||
    verified.purpose === ROOM_ACTIVITY_PURPOSE ||
    verified.purpose === ROOM_MUTATION_PURPOSE
  ) {
    return verified;
  }
  throw new Error(`Room object purpose ${verified.purpose} is not valid transcript traffic`);
}

/** Projection of a verified room object onto the stored transcript shape. */
function roomObjectFields(verified: ChainedRoomObject): {
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
  n: number;
} {
  switch (verified.purpose) {
    case ROOM_MESSAGE_PURPOSE:
      return { kind: "message", text: verified.payload.text, n: verified.payload.n };
    case ROOM_ACTIVITY_PURPOSE:
      return {
        kind: "activity",
        activityKind: verified.payload.activityKind,
        payload: verified.payload.payload,
        n: verified.payload.n,
      };
    case ROOM_MUTATION_PURPOSE:
      return {
        kind: "activity",
        activityKind: verified.payload.action === "delete" ? "message_delete" : "message_edit",
        payload: {
          targetObjectId: verified.payload.targetObjectId,
          ...(verified.payload.text === undefined ? {} : { text: verified.payload.text }),
          ...(verified.payload.payload ?? {}),
        },
        n: verified.payload.n,
      };
  }
}

export interface RoomsAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
  peerRecords: MlsPeerRecordStore;
  publicBaseUrl: string;
  replayGuard?: ReplayGuard;
}

export function registerRoomsAdminRoutes(app: Express, deps: RoomsAdminDeps): void {
  const { identity, mlsStore, rooms, publicBaseUrl, replayGuard } = deps;

  async function admitMember(opts: {
    roomId: string;
    memberDid: string;
    memberEndpoint?: string;
    memberName?: string;
    keyPackageWire: string;
  }) {
    const handshake = await mlsStore.addRoomMember({
      roomId: opts.roomId,
      memberDid: opts.memberDid,
      keyPackageWire: base64ToBytes(opts.keyPackageWire),
    });
    rooms.addMember(opts.roomId, {
      did: opts.memberDid,
      endpoint: opts.memberEndpoint,
      name: opts.memberName,
    });
    return {
      handshake,
      hostEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
    };
  }

  app.get("/rooms", (_req, res) => {
    res.json({
      hosted: rooms.listRooms(),
      joined: rooms.listJoinedRooms(),
    });
  });

  /** Public browse list of active hosted rooms (category grouping in shell). */
  app.get("/rooms/catalog", (_req, res) => {
    res.json({
      rooms: rooms
        .listCatalog()
        .map((d) => {
          const stats = rooms.catalogEntry(d.roomId);
          return {
            roomId: d.roomId,
            name: d.name,
            topic: d.topic,
            description: d.description,
            category: d.category,
            admission: d.admission,
            moduleId: d.moduleId,
            hostDid: d.hostDid,
            status: d.status,
            rules: d.rules,
            creatorDid: d.creatorDid,
            activities: d.activities,
            memberCount: stats?.memberCount ?? 0,
            liveCount: stats?.liveCount ?? 0,
          };
        }),
      hostUrl: publicBaseUrl.replace(/\/$/, ""),
    });
  });

  app.post("/rooms", async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        topic?: string;
        description?: string;
        category?: string;
        admission?: "open" | "invite" | "request";
        moduleId?: string;
        policyUrl?: string;
        hostRules?: string[];
        creatorDid?: string;
        maxMembers?: number;
        roomId?: string;
        acceptedBaseRules?: boolean;
        activities?: Array<{ id?: string; label?: string; emoji?: string; animationKey?: string }>;
      };
      if (!body.name?.trim()) {
        res.status(400).json({ error: "name required" });
        return;
      }
      if (body.acceptedBaseRules !== true) {
        res.status(400).json({ error: "Atom base room rules must be accepted" });
        return;
      }
      const descriptor = rooms.createRoom({
        hostDid: identity.did,
        name: body.name.trim(),
        topic: body.topic ?? body.description,
        description: body.description ?? body.topic,
        category: body.category,
        admission: body.admission ?? "open",
        moduleId: body.moduleId ?? "community/coffee-shop",
        policyUrl: body.policyUrl ?? ATOM_BASE_ROOM_POLICY_URL,
        hostRules: body.hostRules,
        creatorDid: body.creatorDid,
        maxMembers: body.maxMembers,
        roomId: body.roomId,
        activities: normalizeActivities(body.activities),
        hostEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
      });
      await mlsStore.createRoomHost({ roomId: descriptor.roomId });
      res.json({ room: descriptor });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/rooms/:roomId/activities", (req, res) => {
    try {
      const body = req.body as { activities?: unknown };
      const descriptor = rooms.setRoomActivities(
        req.params.roomId,
        normalizeActivities(body.activities),
      );
      res.json({ room: descriptor });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/rooms/:roomId/close", (req, res) => {
    try {
      const descriptor = rooms.closeRoom(req.params.roomId);
      res.json({ room: descriptor });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/rooms/:roomId", (req, res) => {
    const room = rooms.getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({
      descriptor: room.descriptor,
      memberCount: room.members.filter((m) => !m.banned).length,
    });
  });

  app.get("/rooms/:roomId/members", async (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.getRoom(roomId);
    if (room) {
      res.json({
        members: room.members.map((m) => ({
          did: m.did,
          name: m.name,
          endpoint: m.endpoint,
          joinedAt: m.joinedAt,
        })),
      });
      return;
    }
    const joined = rooms.getJoinedRoom(roomId);
    if (!joined) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    try {
      const resp = await fetch(
        `${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/members`,
      );
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Host members failed (${resp.status})`);
      }
      res.json(await resp.json());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * RI-07. A full-range audit, separate from the message poll because that poll
   * is incremental — omission is only meaningful against the whole transcript,
   * so riding the `after=` path would only ever catch a host that was already
   * withholding when the room was opened.
   */
  app.get("/rooms/:roomId/verification", async (req, res) => {
    const roomId = req.params.roomId;
    if (rooms.getRoom(roomId)) {
      res.json({ role: "host" });
      return;
    }
    const joined = rooms.getJoinedRoom(roomId);
    if (!joined) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const local = rooms.listJoinedMessages(roomId);
    try {
      const resp = await fetch(
        `${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/messages?after=0`,
      );
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Host messages failed (${resp.status})`);
      }
      const hosted = (await resp.json()) as { messages?: RoomMessage[] };
      const reconciliation = await reconcileHostTranscript({
        roomId,
        hostMessages: hosted.messages ?? [],
        local,
        cutoff: rooms.v2Cutoff(roomId),
        fullRange: true,
      });
      // Forks are decided locally from the sender's own signatures, so they hold
      // whether or not the host is reachable.
      const forks = local.filter((m) => m.continuity === "fork");
      res.json({
        role: "member",
        summary: reconciliation.summary,
        omissions: reconciliation.omissions,
        forks: forks.map((f) => ({
          objectId: f.objectId,
          senderDid: f.senderDid,
          n: f.n,
          at: f.at,
        })),
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/rooms/:roomId/messages", async (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.getRoom(roomId);
    const afterSeq = Number(req.query.after ?? 0);
    if (room) {
      res.json({ messages: rooms.listMessages(roomId, afterSeq) });
      return;
    }
    const joined = rooms.getJoinedRoom(roomId);
    if (!joined) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    try {
      const resp = await fetch(
        `${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/messages?after=${afterSeq}`,
      );
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Host messages failed (${resp.status})`);
      }
      // Polling messages is a live signal — refresh host presence for liveCount.
      void fetch(`${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberDid: identity.did, attendance: "present" }),
      }).catch(() => undefined);
      const hosted = (await resp.json()) as { messages?: RoomMessage[] };
      // RI-05. The host is the only source of order, but it is not a source of
      // truth about content or completeness — check its claims against what we
      // received directly before handing anything to the reader.
      const reconciliation = await reconcileHostTranscript({
        roomId,
        hostMessages: hosted.messages ?? [],
        local: rooms.listJoinedMessages(roomId),
        cutoff: rooms.v2Cutoff(roomId),
        fullRange: afterSeq === 0,
      });
      res.json({
        messages: reconciliation.messages,
        omissions: reconciliation.omissions,
        verification: reconciliation.summary,
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** RI-06. Host mints a flat signed checkpoint over a contiguous signed-object range. */
  app.post("/rooms/:roomId/checkpoints", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.descriptor.hostDid !== identity.did) {
        res.status(403).json({ error: "Only the host may mint checkpoints" });
        return;
      }
      const body = req.body as { fromSeq?: number; toSeq?: number };
      const fromSeq = Number(body.fromSeq);
      const toSeq = Number(body.toSeq);
      const checkpoint = await mintRoomCheckpoint({
        rooms,
        roomId,
        fromSeq,
        toSeq,
        identity,
      });
      res.json({ checkpoint });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /already minted with different hashes/.test(message) ? 409 : 400;
      res.status(status).json({ error: message });
    }
  });

  /** RI-06. List persisted checkpoints (host local or proxy to host). */
  app.get("/rooms/:roomId/checkpoints", async (req, res) => {
    const roomId = req.params.roomId;
    const fromSeq = req.query.from !== undefined ? Number(req.query.from) : undefined;
    const toSeq = req.query.to !== undefined ? Number(req.query.to) : undefined;
    const room = rooms.getRoom(roomId);
    if (room) {
      const records = rooms.listCheckpoints(roomId, fromSeq, toSeq);
      res.json({
        checkpoints: records.map((r) => r.checkpoint),
      });
      return;
    }
    const joined = rooms.getJoinedRoom(roomId);
    if (!joined) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    try {
      const qs = new URLSearchParams();
      if (fromSeq !== undefined && Number.isFinite(fromSeq)) qs.set("from", String(fromSeq));
      if (toSeq !== undefined && Number.isFinite(toSeq)) qs.set("to", String(toSeq));
      const url = `${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/checkpoints${
        qs.size ? `?${qs}` : ""
      }`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Host checkpoints failed (${resp.status})`);
      }
      const body = (await resp.json()) as { checkpoints?: unknown[] };
      const checkpoints = [];
      for (const raw of body.checkpoints ?? []) {
        const verified = await verifyRoomCheckpoint(raw, {
          expectedHostDid: joined.descriptor.hostDid,
          expectedRoomId: roomId,
        });
        checkpoints.push(verified.object);
      }
      res.json({ checkpoints });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Member heartbeat for catalog liveCount (open rooms; host-authoritative roster). */
  app.post("/rooms/:roomId/presence", (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const body = req.body as { memberDid?: string; attendance?: "present" | "away" };
      const memberDid = body.memberDid?.trim();
      if (!memberDid) {
        res.status(400).json({ error: "memberDid required" });
        return;
      }
      if (!rooms.isMember(roomId, memberDid)) {
        res.status(403).json({ error: "Not a member of this room" });
        return;
      }
      rooms.touchMemberPresence(roomId, memberDid, body.attendance === "away" ? "away" : "present");
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/rooms/:roomId/stats", (req, res) => {
    const room = rooms.getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({ stats: rooms.stats(req.params.roomId) });
  });

  /** Host accepts a member join (open / invite / request). */
  app.post("/rooms/:roomId/join", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.descriptor.status === "closed") {
        res.status(403).json({ error: "Room is closed" });
        return;
      }
      const body = req.body as {
        memberDid?: string;
        memberEndpoint?: string;
        memberName?: string;
        keyPackageWire?: string;
        inviteObject?: DataObject;
        requestOnly?: boolean;
      };
      if (!body.memberDid?.trim()) {
        res.status(400).json({ error: "memberDid required" });
        return;
      }
      const memberDid = body.memberDid.trim();
      const hostSession = mlsStore.getRoomSession(roomId);
      if (rooms.isMember(roomId, memberDid) || hostSession?.memberDids.includes(memberDid)) {
        // Heal roster drift: MLS may still list a DID after rooms.json lost the row.
        if (!rooms.isMember(roomId, memberDid)) {
          rooms.addMember(roomId, {
            did: memberDid,
            endpoint: body.memberEndpoint?.trim(),
            name: body.memberName?.trim(),
          });
        } else {
          rooms.touchMemberPresence(roomId, memberDid, "present");
        }
        res.json({
          alreadyMember: true,
          hostEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
        });
        return;
      }

      const admission = room.descriptor.admission;
      if (admission === "invite") {
        if (!body.inviteObject) {
          res.status(403).json({ error: "Room requires a verified invite" });
          return;
        }
        const { payload } = await verifyRoomInvite(body.inviteObject);
        if (payload.roomId !== roomId) {
          res.status(403).json({ error: "Invite is for a different room" });
          return;
        }
      } else if (admission === "request") {
        if (!body.keyPackageWire?.trim()) {
          res.status(400).json({ error: "keyPackageWire required to request join" });
          return;
        }
        const request = rooms.addJoinRequest({
          roomId,
          memberDid,
          memberName: body.memberName?.trim(),
          endpoint: body.memberEndpoint?.trim(),
          keyPackage: body.keyPackageWire.trim(),
        });
        res.json({ pending: true, request });
        return;
      } else if (admission !== "open") {
        res.status(403).json({ error: "Room is not open for direct join" });
        return;
      }

      if (!body.keyPackageWire?.trim()) {
        res.status(400).json({ error: "keyPackageWire required" });
        return;
      }
      const admitted = await admitMember({
        roomId,
        memberDid,
        memberEndpoint: body.memberEndpoint?.trim(),
        memberName: body.memberName?.trim(),
        keyPackageWire: body.keyPackageWire.trim(),
      });
      res.json(admitted);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/rooms/:roomId/join-requests", (req, res) => {
    const room = rooms.getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({ requests: rooms.listJoinRequests(req.params.roomId, "pending") });
  });

  app.post("/rooms/:roomId/join-requests/:requestId/decide", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const body = req.body as { decision?: "approved" | "denied" };
      if (body.decision !== "approved" && body.decision !== "denied") {
        res.status(400).json({ error: "decision must be approved or denied" });
        return;
      }
      const request = rooms.setJoinRequestStatus(roomId, req.params.requestId, body.decision);
      if (body.decision === "denied") {
        res.json({ request });
        return;
      }
      const keyPackageWire =
        typeof request.keyPackage === "string" ? request.keyPackage : undefined;
      if (!keyPackageWire) {
        res.status(400).json({
          error: "Join request has no key package — ask the member to request again",
          request,
        });
        return;
      }
      const admitted = await admitMember({
        roomId,
        memberDid: request.memberDid,
        memberEndpoint: request.endpoint,
        memberName: request.memberName,
        keyPackageWire,
      });
      res.json({ request, ...admitted });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Member agent joins a remote room hosted elsewhere. */
  app.post("/rooms/join-remote", async (req, res) => {
    try {
      const body = req.body as {
        hostUrl?: string;
        roomId?: string;
        memberName?: string;
        inviteObject?: DataObject;
        requestOnly?: boolean;
      };
      const hostUrl = body.hostUrl?.trim();
      const roomId = body.roomId?.trim();
      if (!hostUrl || !roomId) {
        res.status(400).json({ error: "hostUrl and roomId required" });
        return;
      }
      const result = await joinRemoteRoom(
        {
          identity,
          mlsStore,
          rooms,
          peerRecords: deps.peerRecords,
          publicBaseUrl,
        },
        {
          hostUrl,
          roomId,
          memberName: body.memberName,
          inviteObject: body.inviteObject,
          requestOnly: body.requestOnly,
        },
      );
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Member leaves a room, or host ingests a remote member leave. */
  app.post("/rooms/:roomId/leave", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const body = req.body as { memberDid?: string };
      const room = rooms.getRoom(roomId);
      if (room && body.memberDid?.trim()) {
        const memberDid = body.memberDid.trim();
        if (!rooms.isMember(roomId, memberDid)) {
          res.json({ left: roomId, alreadyLeft: true });
          return;
        }
        rooms.removeMember(roomId, memberDid);
        rooms.appendMessage(roomId, {
          senderDid: memberDid,
          kind: "activity",
          activityKind: "leave",
          payload: { memberDid },
        });
        res.json({ left: roomId });
        return;
      }

      const memberDid = identity.did;
      const joined = rooms.getJoinedRoom(roomId);
      if (joined) {
        try {
          await fetch(`${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberDid }),
          });
        } catch (error) {
          console.warn(
            `[rooms] host leave notify failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        rooms.forgetJoinedRoom(roomId);
        mlsStore.dropRoomSession(roomId);
        res.json({ left: roomId });
        return;
      }
      if (room && rooms.isMember(roomId, memberDid)) {
        rooms.removeMember(roomId, memberDid);
        mlsStore.dropRoomSession(roomId);
        res.json({ left: roomId });
        return;
      }
      if (rooms.forgetJoinedRoom(roomId)) {
        mlsStore.dropRoomSession(roomId);
        res.json({ left: roomId });
        return;
      }
      res.status(404).json({ error: "You are not in this room" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/rooms/:roomId/send", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const body = req.body as {
        text?: string;
        kind?: "message" | "activity";
        activityKind?: string;
        targetObjectId?: string;
        payload?: Record<string, unknown>;
      };
      const kind = body.kind ?? "message";
      const activityKind = body.activityKind?.trim();
      const isMutation =
        kind === "activity" &&
        (activityKind === "message_edit" || activityKind === "message_delete");
      const room = rooms.getRoom(roomId);
      const joined = room ? undefined : rooms.getJoinedRoom(roomId);
      if (!room && !joined) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (room && !rooms.isMember(roomId, identity.did)) {
        res.status(403).json({ error: "Not a member of this room" });
        return;
      }
      if (!mlsStore.hasRoomSession(roomId)) {
        res.status(409).json({ error: "No MLS group session — rejoin the room" });
        return;
      }

      let targetSeq = 0;
      let targetObjectId = typeof body.targetObjectId === "string" ? body.targetObjectId : "";
      if (isMutation) {
        targetSeq = Number(body.payload?.targetSeq);
        if (!targetObjectId) {
          if (!Number.isFinite(targetSeq) || targetSeq < 1) {
            res
              .status(400)
              .json({ error: "targetObjectId or payload.targetSeq required for mutations" });
            return;
          }
          targetObjectId = rooms.getMessage(roomId, targetSeq)?.object?.id ?? "";
        }
        if (!targetObjectId) {
          res.status(409).json({
            error: "Target message has no signed object — pre-migration messages cannot be edited",
          });
          return;
        }
      }

      // RI-03. Allocate the chain position and sign before encrypting, so the
      // position a peer verifies is the position we durably claimed. RI-05:
      // do not advance the durable send chain until the host returns a verified
      // receipt (member path) or local accept completes (host path).
      const previousSend = rooms.chainState(roomId).send;
      const send = previousSend;
      const n = send ? send.n + 1 : 0;
      const prevHash = send?.hash;
      const text = body.text?.trim();
      let object: DataObject;
      if (isMutation) {
        object = await createRoomMutation({
          identity,
          payload: {
            roomId,
            action: activityKind === "message_delete" ? "delete" : "edit",
            targetObjectId,
            ...(text ? { text } : {}),
            ...(body.payload ? { payload: body.payload } : {}),
            n,
            ...(prevHash ? { prevHash } : {}),
          },
        });
      } else if (kind === "activity") {
        if (!activityKind) {
          res.status(400).json({ error: "activityKind required for activity sends" });
          return;
        }
        object = await createRoomActivity({
          identity,
          payload: {
            roomId,
            activityKind,
            ...(body.payload ? { payload: body.payload } : {}),
            n,
            ...(prevHash ? { prevHash } : {}),
          },
        });
      } else {
        if (!text) {
          res.status(400).json({ error: "text required for message sends" });
          return;
        }
        object = await createRoomMessage({
          identity,
          payload: { roomId, text, n, ...(prevHash ? { prevHash } : {}) },
        });
      }
      // Our own signed send is proof this room has moved to v2, whether we host
      // it or not; from here on unsigned history is a downgrade, not a legacy.
      rooms.markV2Cutoff(roomId, { at: object.issuedAt });

      const wire = await mlsStore.encryptRoom(roomId, encodeRoomObject(object));
      if (room) {
        try {
          if (isMutation) {
            const mutated = rooms.applyMessageMutation(roomId, {
              action: activityKind === "message_delete" ? "delete" : "edit",
              targetSeq,
              actorDid: identity.did,
              text,
              payload:
                body.payload?.gif && typeof body.payload.gif === "object"
                  ? { gif: body.payload.gif as Record<string, unknown> }
                  : undefined,
            });
            if (!mutated) {
              res.status(404).json({ error: "Target message not found" });
              return;
            }
            const activity = rooms.appendMessage(roomId, {
              senderDid: identity.did,
              kind: "activity",
              activityKind,
              payload: { ...body.payload, targetSeq, targetObjectId },
              object,
            });
            const receipt = await mintHostAcceptanceReceipt({
              rooms,
              roomId,
              object,
              seq: activity.seq,
              acceptedAt: activity.at,
              identity,
            });
            await rooms.flush();
            rooms.setSendChain(roomId, { n, hash: roomObjectChainHash(object) });
            await fanOutRoomWire({
              roomId,
              senderDid: identity.did,
              wire,
              members: room.members,
              localDid: identity.did,
              mlsStore,
            });
            res.json({ message: mutated, activity, receipt });
            return;
          }
          const message = rooms.appendMessage(roomId, {
            senderDid: identity.did,
            kind: kind === "activity" ? "activity" : "message",
            text,
            activityKind,
            payload: body.payload,
            object,
          });
          const receipt = await mintHostAcceptanceReceipt({
            rooms,
            roomId,
            object,
            seq: message.seq,
            acceptedAt: message.at,
            identity,
          });
          await rooms.flush();
          rooms.setSendChain(roomId, { n, hash: roomObjectChainHash(object) });
          await fanOutRoomWire({
            roomId,
            senderDid: identity.did,
            wire,
            members: room.members,
            localDid: identity.did,
            mlsStore,
          });
          res.json({ message, receipt });
          return;
        } catch (error) {
          rooms.restoreSendChain(roomId, previousSend);
          throw error;
        }
      }
      if (!joined) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      try {
        const relayResp = await fetch(
          `${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/relay`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              senderDid: identity.did,
              wireBase64: Buffer.from(wire).toString("base64"),
            }),
          },
        );
        if (!relayResp.ok) {
          const err = (await relayResp.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Host relay failed (${relayResp.status})`);
        }
        const relayBody = (await relayResp.json()) as { ok?: boolean; receipt?: unknown };
        if (!relayBody.receipt) {
          throw new Error("Host relay succeeded without an acceptance receipt");
        }
        const objectHash = roomObjectChainHash(object);
        const { object: receipt, payload: receiptPayload } = await verifyRoomReceipt(
          relayBody.receipt,
          {
            expectedHostDid: joined.descriptor.hostDid,
            expectedRoomId: roomId,
            expectedObjectHash: objectHash,
            expectedObjectId: object.id,
          },
        );
        rooms.putSenderReceipt(roomId, {
          objectId: object.id,
          objectHash,
          seq: receiptPayload.seq,
          receipt,
          object,
        });
        await rooms.flush();
        rooms.setSendChain(roomId, { n, hash: objectHash });
        res.json({ ok: true, roomId, receipt, objectId: object.id, seq: receiptPayload.seq });
      } catch (error) {
        rooms.restoreSendChain(roomId, previousSend);
        throw error;
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Host ingests MLS wire from a remote member (open rooms). */
  app.post("/rooms/:roomId/relay", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const body = req.body as { senderDid?: string; wireBase64?: string };
      if (!body.senderDid?.trim() || !body.wireBase64?.trim()) {
        res.status(400).json({ error: "senderDid and wireBase64 required" });
        return;
      }
      const result = await handleInboundRoomWire({
        roomId,
        senderDid: body.senderDid.trim(),
        wire: base64ToBytes(body.wireBase64.trim()),
        mlsStore,
        rooms,
        localDid: identity.did,
        replayGuard,
      });
      if (!result.receipt) {
        throw new Error("Host accepted the object without minting a receipt");
      }
      res.json({ ok: true, receipt: result.receipt });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/rooms/:roomId/moderation", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.descriptor.hostDid !== identity.did) {
        res.status(403).json({ error: "Only the room host may moderate" });
        return;
      }
      const body = req.body as { action?: string; subjectDid?: string; reasonCode?: string };
      if (body.action !== "ban" || !body.subjectDid?.trim()) {
        res.status(400).json({ error: "action=ban and subjectDid required" });
        return;
      }
      rooms.banMember(roomId, body.subjectDid.trim(), body.reasonCode?.trim());
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function handleInboundRoomWire(opts: {
  roomId: string;
  senderDid: string;
  wire: Uint8Array;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
  localDid: string;
  replayGuard?: ReplayGuard;
}): Promise<{ receipt?: DataObject }> {
  const room = opts.rooms.getRoom(opts.roomId);
  const joined = room ? undefined : opts.rooms.getJoinedRoom(opts.roomId);
  if (!room && !joined) throw new Error(`Unknown room ${opts.roomId}`);

  const { plaintext, senderDid: mlsSenderDid } = await opts.mlsStore.decryptRoom(
    opts.roomId,
    opts.wire,
  );
  if (mlsSenderDid !== opts.senderDid) {
    throw new Error(
      `Room MLS sender ${mlsSenderDid} does not match claimed sender ${opts.senderDid}`,
    );
  }
  const parsed = parseRoomPayload(plaintext);
  if (parsed.version === 1) {
    // RI-04. Live traffic is always at or above the cutoff, so an unsigned frame
    // arriving now is a downgrade attempt, not history.
    throw new Error("Unsigned room payloads are no longer accepted");
  }

  // RI-05. Idempotent accept: if this objectId was already accepted, return the
  // stored receipt *before* replay rejection so honest retries succeed.
  if (room && room.descriptor.hostDid === opts.localDid) {
    const existing = opts.rooms.getAcceptanceReceipt(opts.roomId, parsed.object.id);
    if (existing) {
      let candidateHash: string;
      try {
        candidateHash = roomObjectChainHash(parsed.object);
      } catch {
        throw new Error("Accepted object id replayed with unhashable payload");
      }
      if (candidateHash !== existing.objectHash) {
        throw new Error("objectId collision with different content");
      }
      return { receipt: existing.receipt };
    }
  }

  const verified = asChainedRoomObject(
    await verifyRoomObject(parsed.object, {
      expectedMlsSenderDid: mlsSenderDid,
      replay: opts.replayGuard,
    }),
  );
  if (verified.payload.roomId !== opts.roomId) {
    throw new Error(
      `Room object is bound to ${verified.payload.roomId}, not ${opts.roomId} — cross-room replay`,
    );
  }
  const fields = roomObjectFields(verified);

  if (room) {
    if (room.descriptor.hostDid !== opts.localDid) return {};
    // The host still enforces the roster; MLS membership alone does not imply
    // the sender is un-banned.
    if (!opts.rooms.isMember(opts.roomId, opts.senderDid)) {
      throw new Error("Sender is not a room member");
    }
    opts.rooms.markV2Cutoff(opts.roomId);
    let accepted: RoomMessage;
    if (verified.purpose === ROOM_MUTATION_PURPOSE) {
      const target = opts.rooms
        .listMessages(opts.roomId)
        .find((m) => m.object?.id === verified.payload.targetObjectId);
      if (!target) throw new Error("Mutation target not found");
      if (target.senderDid !== opts.senderDid) {
        throw new Error("Only the author may edit or delete a message");
      }
      opts.rooms.applyMessageMutation(opts.roomId, {
        action: verified.payload.action,
        targetSeq: target.seq,
        actorDid: opts.senderDid,
        text: verified.payload.text,
        payload:
          verified.payload.payload?.gif && typeof verified.payload.payload.gif === "object"
            ? { gif: verified.payload.payload.gif as Record<string, unknown> }
            : undefined,
      });
      // Keep an activity trail so append-only clients can reconcile.
      accepted = opts.rooms.appendMessage(opts.roomId, {
        senderDid: opts.senderDid,
        kind: "activity",
        activityKind: fields.activityKind,
        payload: { ...fields.payload, targetSeq: target.seq },
        object: verified.object,
      });
    } else {
      accepted = opts.rooms.appendMessage(opts.roomId, {
        senderDid: opts.senderDid,
        kind: fields.kind,
        text: fields.text,
        activityKind: fields.activityKind,
        payload: fields.payload,
        object: verified.object,
      });
    }
    const receipt = await mintHostAcceptanceReceipt({
      rooms: opts.rooms,
      roomId: opts.roomId,
      object: verified.object,
      seq: accepted.seq,
      acceptedAt: accepted.at,
      identity: opts.mlsStore.localIdentity,
    });
    await opts.rooms.flush();
    await fanOutRoomWire({
      roomId: opts.roomId,
      senderDid: opts.senderDid,
      wire: opts.wire,
      members: room.members,
      localDid: opts.localDid,
      mlsStore: opts.mlsStore,
    });
    return { receipt };
  }

  // RI-02 member path. Decryption already proves the sender is in the MLS group,
  // and members hold no roster, so there is no membership check to make here.
  opts.rooms.markV2Cutoff(opts.roomId, { at: verified.object.issuedAt });
  const tracker = trackerFor(opts.rooms, opts.roomId, opts.senderDid);
  const { verdict, admitted } = admitChainLink(tracker, {
    n: verified.payload.n,
    prevHash: verified.payload.prevHash,
    hash: roomObjectChainHash(verified.object),
    objectId: verified.object.id,
  });
  if (verdict.status === "duplicate") return {};
  stashPendingObject(verified.object.id, { verified, fields });

  const write = (
    entry: { verified: ChainedRoomObject; fields: ReturnType<typeof roomObjectFields> },
    continuity: RoomContinuity,
  ) => {
    opts.rooms.appendJoinedMessage(opts.roomId, {
      objectId: entry.verified.object.id,
      roomId: opts.roomId,
      senderDid: opts.senderDid,
      kind: entry.fields.kind,
      text: entry.fields.text,
      activityKind: entry.fields.activityKind,
      payload: entry.fields.payload,
      at: entry.verified.object.issuedAt,
      n: entry.fields.n,
      continuity,
      object: entry.verified.object,
    });
  };

  if (verdict.status === "fork") {
    // A fork never advances the chain, so it is never "admitted" — but it is the
    // one conclusive artefact of a sender signing two histories, and dropping it
    // would discard the only evidence that anything went wrong.
    write({ verified, fields }, "fork");
    pendingRoomObjects.delete(verified.object.id);
    return {};
  }
  if (verdict.status === "pending") {
    // Buffered ahead of a gap. Persist it anyway so the hole is visible in the
    // transcript rather than silently swallowed until the gap fills.
    write({ verified, fields }, "pending");
  } else {
    // `admitted` is the current link plus anything its arrival unblocked, in
    // chain order; each was stashed when it was first buffered.
    for (const link of admitted) {
      const entry = pendingRoomObjects.get(link.objectId);
      if (!entry) continue;
      write(entry, continuityOf(verdict));
      pendingRoomObjects.delete(link.objectId);
    }
  }
  const accepted = tracker.accepted;
  if (accepted) {
    opts.rooms.setRecvChain(opts.roomId, opts.senderDid, {
      n: accepted.n,
      hash: accepted.hash,
    });
  }
  return {};
}

async function mintHostAcceptanceReceipt(opts: {
  rooms: RoomStore;
  roomId: string;
  object: DataObject;
  seq: number;
  acceptedAt: string;
  identity: AgentKeyPair;
}): Promise<DataObject> {
  const existing = opts.rooms.getAcceptanceReceipt(opts.roomId, opts.object.id);
  if (existing) return existing.receipt;
  const objectHash = roomObjectChainHash(opts.object);
  const receipt = await createRoomReceipt({
    identity: opts.identity,
    payload: {
      roomId: opts.roomId,
      objectId: opts.object.id,
      objectHash,
      seq: opts.seq,
      acceptedAt: opts.acceptedAt,
    },
  });
  opts.rooms.putAcceptanceReceipt(opts.roomId, {
    objectId: opts.object.id,
    objectHash,
    seq: opts.seq,
    receipt,
    object: opts.object,
  });
  return receipt;
}

async function fanOutRoomWire(opts: {
  roomId: string;
  senderDid: string;
  wire: Uint8Array;
  members: Array<{ did: string; endpoint?: string; banned?: boolean }>;
  localDid: string;
  mlsStore: MlsSessionStore;
}): Promise<void> {
  for (const member of opts.members) {
    if (member.banned || member.did === opts.senderDid) continue;
    if (member.did === opts.localDid) continue;
    if (!member.endpoint?.trim()) continue;
    // No pairwise-session gate here: the frame is already encrypted to the
    // group, and requiring a 1:1 session silently starved members who joined
    // via key package without ever opening a direct channel.
    try {
      const client = await createAtomPeerClient(member.endpoint, {
        identity: opts.mlsStore.localIdentity,
      });
      await sendMlsWire(client, {
        wire: opts.wire,
        contextId: roomContextId(opts.roomId),
        role: "user",
        senderDid: opts.senderDid,
      });
    } catch (error) {
      console.warn(
        `[rooms] fan-out to ${member.did} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
