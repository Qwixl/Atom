import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { roomObjectChainHash } from "@qwixl/a2a-transport";
import type { DataObject } from "@qwixl/protocol";
import { resolveDataPath } from "./dataDir.js";
import {
  activitiesForRoomId,
  normalizeActivities,
  type RoomActivityDef,
} from "./roomActivities.js";

const ROOMS_FILE = "rooms.json";
const SCHEMA_VERSION = 1;
/** Members with presence/message within this window count as "live". */
const LIVE_WINDOW_MS = 10 * 60 * 1000;

export type RoomAdmission = "open" | "invite" | "request";
export type RoomStatus = "active" | "closed";

export const ATOM_BASE_ROOM_POLICY_URL = "https://qwixl.dev/community/aup";

export type { RoomActivityDef };

export interface RoomRules {
  basePolicyUrl: string;
  hostRules: string[];
}

export interface RoomDescriptor {
  roomId: string;
  hostDid: string;
  name: string;
  topic?: string;
  description?: string;
  category: string;
  admission: RoomAdmission;
  moduleId?: string;
  policyUrl?: string;
  rules: RoomRules;
  creatorDid?: string;
  status: RoomStatus;
  maxMembers: number;
  createdAt: string;
  /** Host-defined room activities (emoji + optional future animationKey). */
  activities: RoomActivityDef[];
}

export interface RoomJoinRequest {
  id: string;
  roomId: string;
  memberDid: string;
  memberName?: string;
  endpoint?: string;
  keyPackage?: unknown;
  requestedAt: string;
  status: "pending" | "approved" | "denied";
}

export interface RoomMember {
  did: string;
  endpoint?: string;
  name?: string;
  joinedAt: string;
  banned?: boolean;
  mutedUntil?: number;
  attendance?: "present" | "away";
  lastSeenAt?: string;
}

export interface RoomMessage {
  seq: number;
  roomId: string;
  senderDid: string;
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
  at: string;
  /** Soft-delete: message hidden but seq retained for sync. */
  deleted?: boolean;
  editedAt?: string;
  /**
   * RI-04. The signed object this message was decoded from, retained so members
   * can verify history fetched over HTTP — that path carries no MLS framing, so
   * without this, backfill and late-join history are unverifiable forever.
   */
  object?: DataObject;
  /**
   * RI-05. Host acceptance receipt for this object, mirrored from the acceptance
   * index so idempotent retries survive index eviction while the message remains
   * in the rolling window.
   */
  receipt?: DataObject;
}

/**
 * RI-05. Host-signed acceptance receipt retained for idempotent retries and
 * sender-side attribution evidence. Keyed by objectId. Mirrored onto the
 * accepted `RoomMessage.receipt` while that message remains in the rolling
 * window; the index may retain entries after roll-off for recent retries.
 */
export interface RoomAcceptanceReceipt {
  objectId: string;
  objectHash: string;
  seq: number;
  receipt: DataObject;
  /** Sender-retained copy of the accepted object (member send path). */
  object?: DataObject;
}

/** RI-06 persisted host checkpoint (signed DataObject + range index). */
export interface RoomCheckpointRecord {
  fromSeq: number;
  toSeq: number;
  checkpoint: DataObject;
  mintedAt: string;
}

/** Continuity of a sender's own chain at the point this object was accepted (RI-03). */
export type RoomContinuity = "ok" | "gap" | "fork" | "pending";

/**
 * A member's own verified transcript entry. Distinct from `RoomMessage` because
 * live fan-out arrives before the host has assigned a `seq`, so order is not
 * known at receipt and must not be invented.
 */
export interface JoinedRoomMessage {
  objectId: string;
  roomId: string;
  senderDid: string;
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
  at: string;
  /** Host-assigned order, once known from backfill. Presentation only. */
  seq?: number;
  /** Sender's own position in its chain. */
  n: number;
  continuity: RoomContinuity;
  object: DataObject;
}

/** Our send position and each sender's receive position, per room (RI-03). */
export interface RoomChainState {
  roomId: string;
  send?: { n: number; hash: string };
  recv: Array<{ senderDid: string; n: number; hash: string }>;
}

interface RoomsFile {
  schemaVersion: number;
  rooms: Array<{
    descriptor: RoomDescriptor;
    members: RoomMember[];
    messages: RoomMessage[];
    nextSeq: number;
    joinRequests?: RoomJoinRequest[];
    v2FromSeq?: number;
    acceptanceReceipts?: RoomAcceptanceReceipt[];
    checkpoints?: RoomCheckpointRecord[];
  }>;
  joinedRooms: Array<{
    roomId: string;
    hostUrl: string;
    descriptor: RoomDescriptor;
    messages?: JoinedRoomMessage[];
    v2FromSeq?: number;
    v2FromAt?: string;
    senderReceipts?: RoomAcceptanceReceipt[];
  }>;
  chains?: RoomChainState[];
}

function normalizeDescriptor(raw: RoomDescriptor): RoomDescriptor {
  const hostRules = raw.rules?.hostRules?.filter((r) => r.trim()) ?? [];
  const activities = activitiesForRoomId(raw.roomId, normalizeActivities(raw.activities));
  return {
    ...raw,
    category: raw.category?.trim() || "Town",
    description: raw.description?.trim() || raw.topic?.trim(),
    status: raw.status === "closed" ? "closed" : "active",
    rules: {
      basePolicyUrl: raw.rules?.basePolicyUrl?.trim() || raw.policyUrl?.trim() || ATOM_BASE_ROOM_POLICY_URL,
      hostRules,
    },
    policyUrl: raw.policyUrl?.trim() || ATOM_BASE_ROOM_POLICY_URL,
    activities,
  };
}

export class RoomStore {
  private rooms = new Map<
    string,
    {
      descriptor: RoomDescriptor;
      members: RoomMember[];
      messages: RoomMessage[];
      nextSeq: number;
      joinRequests: RoomJoinRequest[];
      /** First seq that must carry a signed object. See `markV2Cutoff`. */
      v2FromSeq?: number;
      /** RI-05 host acceptance index (survives message window roll-off). */
      acceptanceReceipts: RoomAcceptanceReceipt[];
      /** RI-06 signed ordering claims. */
      checkpoints: RoomCheckpointRecord[];
    }
  >();
  private joinedRooms = new Map<
    string,
    {
      roomId: string;
      hostUrl: string;
      descriptor: RoomDescriptor;
      messages: JoinedRoomMessage[];
      v2FromSeq?: number;
      v2FromAt?: string;
      /** RI-05 receipts this member holds for its own sends. */
      senderReceipts: RoomAcceptanceReceipt[];
    }
  >();
  private chains = new Map<string, RoomChainState>();
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolveDataPath(ROOMS_FILE)) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<RoomsFile>(this.filePath);
    if (!file) return;
    this.rooms.clear();
    this.joinedRooms.clear();
    this.chains.clear();
    for (const room of file.rooms ?? []) {
      const members = room.members ?? [];
      // Rooms created before the host was seeded onto its own roster: without
      // this their host stays locked out of sending for the room's lifetime.
      if (!members.some((m) => m.did === room.descriptor.hostDid)) {
        members.unshift({
          did: room.descriptor.hostDid,
          joinedAt: room.descriptor.createdAt ?? new Date().toISOString(),
          attendance: "present",
        });
      }
      this.rooms.set(room.descriptor.roomId, {
        ...room,
        members,
        descriptor: normalizeDescriptor(room.descriptor),
        joinRequests: room.joinRequests ?? [],
        // First boot after the RI-04 upgrade: everything already stored predates
        // signing, so the cutoff is wherever the log has reached. Nothing written
        // from here on is allowed to be unsigned.
        v2FromSeq: room.v2FromSeq ?? room.nextSeq,
        acceptanceReceipts: room.acceptanceReceipts ?? [],
        checkpoints: room.checkpoints ?? [],
      });
    }
    for (const joined of file.joinedRooms ?? []) {
      this.joinedRooms.set(joined.roomId, {
        ...joined,
        descriptor: normalizeDescriptor(joined.descriptor),
        messages: joined.messages ?? [],
        senderReceipts: joined.senderReceipts ?? [],
      });
    }
    for (const chain of file.chains ?? []) {
      this.chains.set(chain.roomId, { ...chain, recv: chain.recv ?? [] });
    }
  }

  createRoom(opts: {
    hostDid: string;
    name: string;
    topic?: string;
    description?: string;
    category?: string;
    admission?: RoomAdmission;
    moduleId?: string;
    policyUrl?: string;
    hostRules?: string[];
    creatorDid?: string;
    status?: RoomStatus;
    maxMembers?: number;
    roomId?: string;
    activities?: RoomActivityDef[];
    hostEndpoint?: string;
  }): RoomDescriptor {
    const roomId = opts.roomId?.trim() || `room:${randomUUID()}`;
    const policyUrl = opts.policyUrl?.trim() || ATOM_BASE_ROOM_POLICY_URL;
    const descriptor = normalizeDescriptor({
      roomId,
      hostDid: opts.hostDid,
      name: opts.name.trim(),
      topic: opts.topic?.trim(),
      description: opts.description?.trim() || opts.topic?.trim(),
      category: opts.category?.trim() || "Town",
      admission: opts.admission ?? "invite",
      moduleId: opts.moduleId?.trim(),
      policyUrl,
      rules: {
        basePolicyUrl: ATOM_BASE_ROOM_POLICY_URL,
        hostRules: (opts.hostRules ?? []).map((r) => r.trim()).filter(Boolean),
      },
      creatorDid: opts.creatorDid?.trim(),
      status: opts.status ?? "active",
      maxMembers: opts.maxMembers ?? 64,
      createdAt: new Date().toISOString(),
      activities: opts.activities ?? [],
    });
    this.rooms.set(roomId, {
      descriptor,
      // A host is a member of its own room: it is in the MLS group, it sends,
      // and every send path gates on `isMember`. Leaving the roster empty meant
      // a host could create a room it was then forbidden to post in.
      members: [
        {
          did: opts.hostDid,
          endpoint: opts.hostEndpoint?.trim() || undefined,
          joinedAt: new Date().toISOString(),
          attendance: "present",
        },
      ],
      messages: [],
      nextSeq: 1,
      joinRequests: [],
      // Rooms created after RI-04 are v2-only; there is no legacy history to admit.
      v2FromSeq: 1,
      acceptanceReceipts: [],
      checkpoints: [],
    });
    void this.persist();
    return descriptor;
  }

  getRoom(roomId: string):
    | {
        descriptor: RoomDescriptor;
        members: RoomMember[];
        messages: RoomMessage[];
        nextSeq: number;
        joinRequests: RoomJoinRequest[];
      }
    | undefined {
    return this.rooms.get(roomId);
  }

  listRooms(): RoomDescriptor[] {
    return [...this.rooms.values()].map((room) => room.descriptor);
  }

  listCatalog(): RoomDescriptor[] {
    return this.listRooms().filter((d) => d.status === "active");
  }

  catalogEntry(roomId: string): {
    descriptor: RoomDescriptor;
    memberCount: number;
    liveCount: number;
  } | null {
    const room = this.rooms.get(roomId);
    if (!room || room.descriptor.status !== "active") return null;
    const now = Date.now();
    const members = room.members.filter((m) => !m.banned);
    const liveCount = members.filter((m) => {
      if (m.attendance === "away") return false;
      const seen = m.lastSeenAt ? Date.parse(m.lastSeenAt) : Date.parse(m.joinedAt);
      return Number.isFinite(seen) && now - seen <= LIVE_WINDOW_MS;
    }).length;
    return {
      descriptor: room.descriptor,
      memberCount: members.length,
      liveCount,
    };
  }

  closeRoom(roomId: string): RoomDescriptor {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    room.descriptor = { ...room.descriptor, status: "closed" };
    void this.persist();
    return room.descriptor;
  }

  setRoomActivities(roomId: string, activities: RoomActivityDef[]): RoomDescriptor {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    room.descriptor = normalizeDescriptor({
      ...room.descriptor,
      activities: normalizeActivities(activities),
    });
    void this.persist();
    return room.descriptor;
  }

  touchMemberPresence(
    roomId: string,
    memberDid: string,
    attendance: "present" | "away" = "present",
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const member = room.members.find((m) => m.did === memberDid);
    if (!member) return;
    member.attendance = attendance;
    member.lastSeenAt = new Date().toISOString();
    void this.persist();
  }

  updateRoomMeta(
    roomId: string,
    patch: Partial<
      Pick<
        RoomDescriptor,
        "name" | "topic" | "description" | "category" | "admission" | "rules" | "activities"
      >
    >,
  ): RoomDescriptor {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    room.descriptor = normalizeDescriptor({
      ...room.descriptor,
      ...patch,
      rules: patch.rules ?? room.descriptor.rules,
      activities: patch.activities ?? room.descriptor.activities,
    });
    void this.persist();
    return room.descriptor;
  }

  listJoinRequests(roomId: string, status: RoomJoinRequest["status"] = "pending"): RoomJoinRequest[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.joinRequests.filter((r) => r.status === status);
  }

  addJoinRequest(opts: {
    roomId: string;
    memberDid: string;
    memberName?: string;
    endpoint?: string;
    keyPackage?: unknown;
  }): RoomJoinRequest {
    const room = this.rooms.get(opts.roomId);
    if (!room) throw new Error(`Unknown room ${opts.roomId}`);
    if (room.descriptor.status === "closed") throw new Error("Room is closed");
    const existing = room.joinRequests.find(
      (r) => r.memberDid === opts.memberDid && r.status === "pending",
    );
    if (existing) return existing;
    const entry: RoomJoinRequest = {
      id: randomUUID(),
      roomId: opts.roomId,
      memberDid: opts.memberDid,
      memberName: opts.memberName?.trim(),
      endpoint: opts.endpoint?.trim(),
      keyPackage: opts.keyPackage,
      requestedAt: new Date().toISOString(),
      status: "pending",
    };
    room.joinRequests.push(entry);
    void this.persist();
    return entry;
  }

  setJoinRequestStatus(
    roomId: string,
    requestId: string,
    status: "approved" | "denied",
  ): RoomJoinRequest {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const req = room.joinRequests.find((r) => r.id === requestId);
    if (!req) throw new Error("Join request not found");
    req.status = status;
    void this.persist();
    return req;
  }

  addMember(roomId: string, member: Omit<RoomMember, "joinedAt">): RoomMember {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    if (room.members.some((m) => m.did === member.did)) {
      return room.members.find((m) => m.did === member.did)!;
    }
    if (room.members.length >= room.descriptor.maxMembers) {
      throw new Error("Room is full");
    }
    const now = new Date().toISOString();
    const entry: RoomMember = {
      ...member,
      joinedAt: now,
      lastSeenAt: now,
      attendance: member.attendance ?? "present",
    };
    room.members.push(entry);
    void this.persist();
    return entry;
  }

  removeMember(roomId: string, did: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.members = room.members.filter((m) => m.did !== did);
    void this.persist();
  }

  isMember(roomId: string, did: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.members.some((m) => m.did === did && !m.banned);
  }

  banMember(roomId: string, did: string, reasonCode?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const member = room.members.find((m) => m.did === did);
    if (member) {
      member.banned = true;
      void this.persist();
    }
    this.appendMessage(roomId, {
      senderDid: room.descriptor.hostDid,
      kind: "activity",
      activityKind: "moderation",
      payload: { action: "ban", subjectDid: did, reasonCode },
    });
  }

  appendMessage(
    roomId: string,
    msg: Omit<RoomMessage, "seq" | "roomId" | "at">,
  ): RoomMessage {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const member = room.members.find((m) => m.did === msg.senderDid);
    if (member?.banned) {
      throw new Error("Sender is banned from this room");
    }
    if (member?.mutedUntil && member.mutedUntil > Date.now()) {
      throw new Error("Sender is muted in this room");
    }
    const entry: RoomMessage = {
      seq: room.nextSeq++,
      roomId,
      at: new Date().toISOString(),
      ...msg,
    };
    room.messages.push(entry);
    if (room.messages.length > 500) {
      room.messages = room.messages.slice(-500);
    }
    if (member) {
      if (msg.kind === "activity" && msg.activityKind === "presence-away") {
        member.attendance = "away";
      } else if (msg.activityKind !== "leave") {
        member.attendance = "present";
      }
      member.lastSeenAt = entry.at;
    }
    void this.persist();
    return entry;
  }

  listMessages(roomId: string, afterSeq = 0): RoomMessage[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.messages.filter((m) => m.seq > afterSeq);
  }

  getMessage(roomId: string, seq: number): RoomMessage | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.messages.find((m) => m.seq === seq);
  }

  /** Owner-only soft delete. Returns the updated message or null. */
  softDeleteMessage(roomId: string, seq: number, actorDid: string): RoomMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const message = room.messages.find((m) => m.seq === seq);
    if (!message) return null;
    if (message.kind !== "message") throw new Error("Only chat messages can be deleted");
    if (message.senderDid !== actorDid) throw new Error("Only the author can delete this message");
    if (message.deleted) return message;
    message.deleted = true;
    message.text = undefined;
    message.payload = undefined;
    void this.persist();
    return message;
  }

  /** Owner-only edit of message text (and optional GIF payload). */
  editMessage(
    roomId: string,
    seq: number,
    actorDid: string,
    opts: { text?: string; payload?: Record<string, unknown> },
  ): RoomMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const message = room.messages.find((m) => m.seq === seq);
    if (!message) return null;
    if (message.kind !== "message") throw new Error("Only chat messages can be edited");
    if (message.senderDid !== actorDid) throw new Error("Only the author can edit this message");
    if (message.deleted) throw new Error("Cannot edit a deleted message");
    const text = opts.text?.trim();
    if (text !== undefined) message.text = text || undefined;
    if (opts.payload !== undefined) message.payload = opts.payload;
    message.editedAt = new Date().toISOString();
    void this.persist();
    return message;
  }

  /**
   * Apply a remote edit/delete activity onto the local message log.
   * Used when peers receive `message_edit` / `message_delete` activities.
   */
  applyMessageMutation(
    roomId: string,
    opts: {
      action: "edit" | "delete";
      targetSeq: number;
      actorDid: string;
      text?: string;
      payload?: Record<string, unknown>;
    },
  ): RoomMessage | null {
    if (opts.action === "delete") {
      return this.softDeleteMessage(roomId, opts.targetSeq, opts.actorDid);
    }
    return this.editMessage(roomId, opts.targetSeq, opts.actorDid, {
      text: opts.text,
      payload: opts.payload,
    });
  }

  stats(roomId: string): {
    present: number;
    joinsToday: number;
    messagesToday: number;
    activities: Record<string, number>;
  } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { present: 0, joinsToday: 0, messagesToday: 0, activities: {} };
    }
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayMs = dayStart.getTime();
    const joinsToday = room.members.filter((m) => new Date(m.joinedAt).getTime() >= dayMs).length;
    const todayMessages = room.messages.filter((m) => new Date(m.at).getTime() >= dayMs);
    const activities: Record<string, number> = {};
    for (const msg of todayMessages) {
      if (msg.kind === "activity" && msg.activityKind) {
        activities[msg.activityKind] = (activities[msg.activityKind] ?? 0) + 1;
      }
    }
    const catalog = this.catalogEntry(roomId);
    return {
      present: catalog?.liveCount ?? room.members.filter((m) => !m.banned).length,
      joinsToday,
      messagesToday: todayMessages.filter((m) => m.kind === "message").length,
      activities,
    };
  }

  listJoinedRooms(): Array<{ roomId: string; hostUrl: string; descriptor: RoomDescriptor }> {
    return [...this.joinedRooms.values()];
  }

  rememberJoinedRoom(entry: { roomId: string; hostUrl: string; descriptor: RoomDescriptor }): void {
    const existing = this.joinedRooms.get(entry.roomId);
    this.joinedRooms.set(entry.roomId, {
      ...entry,
      messages: existing?.messages ?? [],
      v2FromSeq: existing?.v2FromSeq,
      v2FromAt: existing?.v2FromAt,
      senderReceipts: existing?.senderReceipts ?? [],
    });
    void this.persist();
  }

  getJoinedRoom(roomId: string):
    | { roomId: string; hostUrl: string; descriptor: RoomDescriptor }
    | undefined {
    return this.joinedRooms.get(roomId);
  }

  /**
   * RI-02. A member's own verified transcript, keyed by object id because live
   * fan-out has no `seq` and the same object can arrive twice (fan-out plus
   * backfill). Re-delivery updates in place; it is not a new message.
   */
  appendJoinedMessage(roomId: string, entry: JoinedRoomMessage): JoinedRoomMessage {
    const joined = this.joinedRooms.get(roomId);
    if (!joined) throw new Error(`Not a joined room ${roomId}`);
    const index = joined.messages.findIndex((m) => m.objectId === entry.objectId);
    if (index >= 0) {
      joined.messages[index] = { ...joined.messages[index], ...entry };
    } else {
      joined.messages.push(entry);
      if (joined.messages.length > 500) {
        joined.messages = joined.messages.slice(-500);
      }
    }
    void this.persist();
    return entry;
  }

  listJoinedMessages(roomId: string): JoinedRoomMessage[] {
    return this.joinedRooms.get(roomId)?.messages ?? [];
  }

  /**
   * RI-04. The first position that must carry a signed object. Everything below
   * it is pre-migration and renders as legacy; everything at or above it must
   * verify. Without this boundary a host can strip signatures and re-serve
   * forged history as "legacy", which is indistinguishable from the real thing.
   */
  markV2Cutoff(roomId: string, opts: { seq?: number; at?: string } = {}): void {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.v2FromSeq === undefined) {
        room.v2FromSeq = opts.seq ?? room.nextSeq;
        void this.persist();
      }
      return;
    }
    const joined = this.joinedRooms.get(roomId);
    if (!joined || joined.v2FromSeq !== undefined || joined.v2FromAt !== undefined) return;
    joined.v2FromSeq = opts.seq;
    joined.v2FromAt = opts.at ?? new Date().toISOString();
    void this.persist();
  }

  v2Cutoff(roomId: string): { seq?: number; at?: string } | undefined {
    const room = this.rooms.get(roomId);
    if (room) return room.v2FromSeq === undefined ? undefined : { seq: room.v2FromSeq };
    const joined = this.joinedRooms.get(roomId);
    if (!joined) return undefined;
    if (joined.v2FromSeq === undefined && joined.v2FromAt === undefined) return undefined;
    return { seq: joined.v2FromSeq, at: joined.v2FromAt };
  }

  /** RI-03 chain positions. Buffered out-of-order objects stay in memory only. */
  chainState(roomId: string): RoomChainState {
    let state = this.chains.get(roomId);
    if (!state) {
      state = { roomId, recv: [] };
      this.chains.set(roomId, state);
    }
    return state;
  }

  setSendChain(roomId: string, position: { n: number; hash: string }): void {
    this.chainState(roomId).send = position;
    void this.persist();
  }

  /**
   * RI-05. Roll back a speculative send-chain advance when host acceptance fails,
   * so a failed relay does not manufacture an RI-03 gap that looks like omission.
   */
  restoreSendChain(roomId: string, position: { n: number; hash: string } | undefined): void {
    const state = this.chainState(roomId);
    if (position) state.send = position;
    else delete state.send;
    void this.persist();
  }

  setRecvChain(roomId: string, senderDid: string, position: { n: number; hash: string }): void {
    const state = this.chainState(roomId);
    const existing = state.recv.find((r) => r.senderDid === senderDid);
    if (existing) {
      existing.n = position.n;
      existing.hash = position.hash;
    } else {
      state.recv.push({ senderDid, ...position });
    }
    void this.persist();
  }

  findMessageByObjectId(roomId: string, objectId: string): RoomMessage | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.messages.find((m) => m.object?.id === objectId);
  }

  getAcceptanceReceipt(roomId: string, objectId: string): RoomAcceptanceReceipt | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const indexed = room.acceptanceReceipts.find((r) => r.objectId === objectId);
    if (indexed) return indexed;
    // Fall back to the in-window message mirror after index eviction.
    const message = room.messages.find((m) => m.object?.id === objectId && m.receipt);
    if (!message?.object || !message.receipt) return undefined;
    return {
      objectId,
      objectHash: roomObjectChainHash(message.object),
      seq: message.seq,
      receipt: message.receipt,
      object: message.object,
    };
  }

  putAcceptanceReceipt(roomId: string, entry: RoomAcceptanceReceipt): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const index = room.acceptanceReceipts.findIndex((r) => r.objectId === entry.objectId);
    if (index >= 0) room.acceptanceReceipts[index] = entry;
    else room.acceptanceReceipts.push(entry);
    // Bound like the message window for rolled-off evidence; in-window messages
    // also mirror `receipt` so idempotent retries survive index eviction.
    if (room.acceptanceReceipts.length > 500) {
      room.acceptanceReceipts = room.acceptanceReceipts.slice(-500);
    }
    const message = room.messages.find((m) => m.object?.id === entry.objectId);
    if (message) message.receipt = entry.receipt;
    void this.persist();
  }

  getSenderReceipt(roomId: string, objectId: string): RoomAcceptanceReceipt | undefined {
    const joined = this.joinedRooms.get(roomId);
    if (joined) return joined.senderReceipts.find((r) => r.objectId === objectId);
    // Host self-send: acceptance index is the sender's own evidence store.
    return this.getAcceptanceReceipt(roomId, objectId);
  }

  putSenderReceipt(roomId: string, entry: RoomAcceptanceReceipt): void {
    const joined = this.joinedRooms.get(roomId);
    if (joined) {
      const index = joined.senderReceipts.findIndex((r) => r.objectId === entry.objectId);
      if (index >= 0) joined.senderReceipts[index] = entry;
      else joined.senderReceipts.push(entry);
      if (joined.senderReceipts.length > 500) {
        joined.senderReceipts = joined.senderReceipts.slice(-500);
      }
      void this.persist();
      return;
    }
    this.putAcceptanceReceipt(roomId, entry);
  }

  listCheckpoints(roomId: string, fromSeq?: number, toSeq?: number): RoomCheckpointRecord[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.checkpoints.filter((c) => {
      if (fromSeq !== undefined && c.toSeq < fromSeq) return false;
      if (toSeq !== undefined && c.fromSeq > toSeq) return false;
      return true;
    });
  }

  findCheckpoint(roomId: string, fromSeq: number, toSeq: number): RoomCheckpointRecord | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.checkpoints.find((c) => c.fromSeq === fromSeq && c.toSeq === toSeq);
  }

  putCheckpoint(roomId: string, entry: RoomCheckpointRecord): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const index = room.checkpoints.findIndex(
      (c) => c.fromSeq === entry.fromSeq && c.toSeq === entry.toSeq,
    );
    if (index >= 0) room.checkpoints[index] = entry;
    else room.checkpoints.push(entry);
    if (room.checkpoints.length > 64) {
      room.checkpoints = room.checkpoints.slice(-64);
    }
    void this.persist();
  }

  forgetJoinedRoom(roomId: string): boolean {
    const removed = this.joinedRooms.delete(roomId);
    if (removed) void this.persist();
    return removed;
  }

  /**
   * Wait for queued writes to reach disk. Every mutator fires `persist()` and
   * moves on, which is right for request latency but means a fast shutdown — or
   * a test tearing down its data directory — can race the write it just caused.
   * RI-05: callers that return acceptance receipts MUST await flush and treat
   * rejection as accept failure (do not acknowledge a receipt that is not durable).
   */
  async flush(): Promise<void> {
    await this.persistQueue;
  }

  private persist(): void {
    // Recover the chain after a failed write so later mutators can retry;
    // callers that await flush() still see the rejection from the failed hop.
    this.persistQueue = this.persistQueue
      .catch(() => {
        /* recovered */
      })
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          rooms: [...this.rooms.values()],
          joinedRooms: [...this.joinedRooms.values()],
          chains: [...this.chains.values()],
        } satisfies RoomsFile);
      });
  }
}
