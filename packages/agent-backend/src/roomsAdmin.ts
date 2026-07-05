import type { Express } from "express";
import { ClientFactory } from "@a2a-js/sdk/client";
import { sendMlsWire } from "@qwixl/a2a-transport";
import { base64ToBytes } from "@qwixl/protocol";
import type { AgentKeyPair } from "@qwixl/protocol";
import { connectMlsPeer } from "./mlsReconnect.js";
import {
  adminBaseFromPeerUrl,
  encodeRoomPayload,
  parseRoomPayload,
  roomContextId,
  type MlsSessionStore,
} from "./mlsSessions.js";
import { normalizePeerBaseUrl } from "./deliverObject.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { RoomDescriptor, RoomStore } from "./roomStore.js";

export interface RoomsAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
  peerRecords: MlsPeerRecordStore;
  publicBaseUrl: string;
}

export function registerRoomsAdminRoutes(app: Express, deps: RoomsAdminDeps): void {
  const { identity, mlsStore, rooms, publicBaseUrl } = deps;

  app.get("/rooms", (_req, res) => {
    res.json({
      hosted: rooms.listRooms(),
      joined: rooms.listJoinedRooms(),
    });
  });

  app.post("/rooms", async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        topic?: string;
        admission?: "open" | "invite" | "request";
        moduleId?: string;
        policyUrl?: string;
        maxMembers?: number;
        roomId?: string;
      };
      if (!body.name?.trim()) {
        res.status(400).json({ error: "name required" });
        return;
      }
      const descriptor = rooms.createRoom({
        hostDid: identity.did,
        name: body.name.trim(),
        topic: body.topic,
        admission: body.admission,
        moduleId: body.moduleId,
        policyUrl: body.policyUrl,
        maxMembers: body.maxMembers,
        roomId: body.roomId,
      });
      await mlsStore.createRoomHost({ localDid: identity.did, roomId: descriptor.roomId });
      res.json({ room: descriptor });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
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
      res.json(await resp.json());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
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

  /** Host accepts a member join (open rooms). */
  app.post("/rooms/:roomId/join", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const body = req.body as {
        memberDid?: string;
        memberEndpoint?: string;
        memberName?: string;
        keyPackageWire?: string;
      };
      if (!body.memberDid?.trim() || !body.keyPackageWire?.trim()) {
        res.status(400).json({ error: "memberDid and keyPackageWire required" });
        return;
      }
      if (room.descriptor.admission !== "open") {
        res.status(403).json({ error: "Room is not open for direct join" });
        return;
      }
      const memberDid = body.memberDid.trim();
      const hostSession = mlsStore.getRoomSession(roomId);
      if (rooms.isMember(roomId, memberDid) || hostSession?.memberDids.includes(memberDid)) {
        res.json({
          alreadyMember: true,
          hostEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
        });
        return;
      }
      const handshake = await mlsStore.addRoomMember({
        roomId,
        memberDid: body.memberDid.trim(),
        keyPackageWire: base64ToBytes(body.keyPackageWire.trim()),
      });
      rooms.addMember(roomId, {
        did: body.memberDid.trim(),
        endpoint: body.memberEndpoint?.trim(),
        name: body.memberName?.trim(),
      });
      res.json({ handshake, hostEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc` });
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
      };
      const hostUrl = body.hostUrl?.trim();
      const roomId = body.roomId?.trim();
      if (!hostUrl || !roomId) {
        res.status(400).json({ error: "hostUrl and roomId required" });
        return;
      }
      const adminBase = adminBaseFromPeerUrl(hostUrl);
      const joinedLocal = rooms.getJoinedRoom(roomId);
      if (joinedLocal && mlsStore.hasRoomSession(roomId)) {
        res.json({ joined: roomId, descriptor: joinedLocal.descriptor, alreadyMember: true });
        return;
      }
      const memberKp = await mlsStore.memberKeyPackage(identity.did);
      const joinResp = await fetch(`${adminBase}/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberDid: identity.did,
          memberEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
          memberName: body.memberName?.trim(),
          keyPackageWire: Buffer.from(memberKp.wire).toString("base64"),
        }),
      });
      if (!joinResp.ok) {
        const err = (await joinResp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Host join failed (${joinResp.status})`);
      }
      const joined = (await joinResp.json()) as {
        alreadyMember?: boolean;
        handshake?: {
          initiatorDid: string;
          welcome: string;
          ratchetTree: string;
          memberDids?: string[];
        };
      };
      if (joined.alreadyMember) {
        if (!mlsStore.hasRoomSession(roomId)) {
          throw new Error(
            "You are listed in this room but MLS keys are missing on your agent — restart your agent or ask the host to remove and re-invite you.",
          );
        }
      } else if (joined.handshake) {
        await mlsStore.joinRoom({
          localDid: identity.did,
          roomId,
          handshake: {
            mediaType: "application/vnd.atom.mls-handshake+json;version=1",
            initiatorDid: joined.handshake.initiatorDid,
            welcome: joined.handshake.welcome,
            ratchetTree: joined.handshake.ratchetTree,
            memberDids: joined.handshake.memberDids,
          },
          memberPackages: memberKp.packages,
        });
      } else {
        throw new Error("Host join returned no handshake");
      }
      const descriptorResp = await fetch(`${adminBase}/rooms/${encodeURIComponent(roomId)}`);
      const descriptorBody = descriptorResp.ok
        ? ((await descriptorResp.json()) as { descriptor?: RoomDescriptor })
        : {};
      const descriptor = descriptorBody.descriptor;
      if (descriptor) {
        rooms.rememberJoinedRoom({
          roomId,
          hostUrl: adminBase,
          descriptor,
        });
      }
      if (descriptor && !mlsStore.hasSession(descriptor.hostDid)) {
        try {
          await connectMlsPeer({
            mlsStore,
            peerRecords: deps.peerRecords,
            localDid: identity.did,
            peerDid: descriptor.hostDid,
            peerUrl: `${adminBase}/a2a/jsonrpc`,
            initiatorEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
          });
        } catch (error) {
          console.warn(
            `[rooms] host MLS pair connect failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      res.json({ joined: roomId, descriptor: descriptor ?? null, alreadyMember: Boolean(joined.alreadyMember) });
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
        payload?: Record<string, unknown>;
      };
      const kind = body.kind ?? "message";
      const payload = encodeRoomPayload({
        kind,
        text: body.text?.trim(),
        activityKind: body.activityKind?.trim(),
        payload: body.payload,
      });
      const room = rooms.getRoom(roomId);
      if (room) {
        if (!rooms.isMember(roomId, identity.did)) {
          res.status(403).json({ error: "Not a member of this room" });
          return;
        }
        if (!mlsStore.hasRoomSession(roomId)) {
          res.status(409).json({ error: "No MLS group session — rejoin the room" });
          return;
        }
        const wire = await mlsStore.encryptRoom(roomId, payload);
        const parsed = parseRoomPayload(payload);
        const message = rooms.appendMessage(roomId, {
          senderDid: identity.did,
          kind: parsed.kind,
          text: parsed.text,
          activityKind: parsed.activityKind,
          payload: parsed.payload,
        });
        await fanOutRoomWire({
          roomId,
          senderDid: identity.did,
          wire,
          members: room.members,
          localDid: identity.did,
          mlsStore,
        });
        res.json({ message });
        return;
      }
      const joined = rooms.getJoinedRoom(roomId);
      if (!joined) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!mlsStore.hasRoomSession(roomId)) {
        res.status(409).json({ error: "No MLS group session — rejoin the room" });
        return;
      }
      const wire = await mlsStore.encryptRoom(roomId, payload);
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
      res.json({ pending: true, roomId });
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
      await handleInboundRoomWire({
        roomId,
        senderDid: body.senderDid.trim(),
        wire: base64ToBytes(body.wireBase64.trim()),
        mlsStore,
        rooms,
        localDid: identity.did,
      });
      res.json({ ok: true });
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
}): Promise<void> {
  const room = opts.rooms.getRoom(opts.roomId);
  if (!room) throw new Error(`Unknown room ${opts.roomId}`);
  if (!opts.rooms.isMember(opts.roomId, opts.senderDid)) {
    throw new Error("Sender is not a room member");
  }
  const isHost = room.descriptor.hostDid === opts.localDid;
  if (!isHost) return;
  const plaintext = await opts.mlsStore.decryptRoom(opts.roomId, opts.wire);
  const parsed = parseRoomPayload(plaintext);
  opts.rooms.appendMessage(opts.roomId, {
    senderDid: opts.senderDid,
    kind: parsed.kind,
    text: parsed.text,
    activityKind: parsed.activityKind,
    payload: parsed.payload,
  });
  await fanOutRoomWire({
    roomId: opts.roomId,
    senderDid: opts.senderDid,
    wire: opts.wire,
    members: room.members,
    localDid: opts.localDid,
    mlsStore: opts.mlsStore,
  });
}

async function fanOutRoomWire(opts: {
  roomId: string;
  senderDid: string;
  wire: Uint8Array;
  members: Array<{ did: string; endpoint?: string; banned?: boolean }>;
  localDid: string;
  mlsStore: MlsSessionStore;
}): Promise<void> {
  const factory = new ClientFactory();
  for (const member of opts.members) {
    if (member.banned || member.did === opts.senderDid) continue;
    if (member.did === opts.localDid) continue;
    if (!member.endpoint?.trim()) continue;
    if (!opts.mlsStore.hasSession(member.did)) continue;
    try {
      const client = await factory.createFromUrl(normalizePeerBaseUrl(member.endpoint));
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
