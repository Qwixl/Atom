import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const ROOMS_FILE = "rooms.json";
const SCHEMA_VERSION = 1;

export type RoomAdmission = "open" | "invite" | "request";

export interface RoomDescriptor {
  roomId: string;
  hostDid: string;
  name: string;
  topic?: string;
  admission: RoomAdmission;
  moduleId?: string;
  policyUrl?: string;
  maxMembers: number;
  createdAt: string;
}

export interface RoomMember {
  did: string;
  endpoint?: string;
  name?: string;
  joinedAt: string;
  banned?: boolean;
  mutedUntil?: number;
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
}

interface RoomsFile {
  schemaVersion: number;
  rooms: Array<{
    descriptor: RoomDescriptor;
    members: RoomMember[];
    messages: RoomMessage[];
    nextSeq: number;
  }>;
  joinedRooms: Array<{
    roomId: string;
    hostUrl: string;
    descriptor: RoomDescriptor;
  }>;
}

export class RoomStore {
  private rooms = new Map<
    string,
    {
      descriptor: RoomDescriptor;
      members: RoomMember[];
      messages: RoomMessage[];
      nextSeq: number;
    }
  >();
  private joinedRooms = new Map<
    string,
    { roomId: string; hostUrl: string; descriptor: RoomDescriptor }
  >();
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
    for (const room of file.rooms ?? []) {
      this.rooms.set(room.descriptor.roomId, room);
    }
    for (const joined of file.joinedRooms ?? []) {
      this.joinedRooms.set(joined.roomId, joined);
    }
  }

  createRoom(opts: {
    hostDid: string;
    name: string;
    topic?: string;
    admission?: RoomAdmission;
    moduleId?: string;
    policyUrl?: string;
    maxMembers?: number;
    roomId?: string;
  }): RoomDescriptor {
    const roomId = opts.roomId?.trim() || `room:${randomUUID()}`;
    const descriptor: RoomDescriptor = {
      roomId,
      hostDid: opts.hostDid,
      name: opts.name.trim(),
      topic: opts.topic?.trim(),
      admission: opts.admission ?? "open",
      moduleId: opts.moduleId?.trim(),
      policyUrl: opts.policyUrl?.trim(),
      maxMembers: opts.maxMembers ?? 64,
      createdAt: new Date().toISOString(),
    };
    this.rooms.set(roomId, {
      descriptor,
      members: [],
      messages: [],
      nextSeq: 1,
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
      }
    | undefined {
    return this.rooms.get(roomId);
  }

  listRooms(): RoomDescriptor[] {
    return [...this.rooms.values()].map((room) => room.descriptor);
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
    const entry: RoomMember = { ...member, joinedAt: new Date().toISOString() };
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
    void this.persist();
    return entry;
  }

  listMessages(roomId: string, afterSeq = 0): RoomMessage[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.messages.filter((m) => m.seq > afterSeq);
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
    return {
      present: room.members.filter((m) => !m.banned).length,
      joinsToday,
      messagesToday: todayMessages.filter((m) => m.kind === "message").length,
      activities,
    };
  }

  listJoinedRooms(): Array<{ roomId: string; hostUrl: string; descriptor: RoomDescriptor }> {
    return [...this.joinedRooms.values()];
  }

  rememberJoinedRoom(entry: { roomId: string; hostUrl: string; descriptor: RoomDescriptor }): void {
    this.joinedRooms.set(entry.roomId, entry);
    void this.persist();
  }

  getJoinedRoom(roomId: string):
    | { roomId: string; hostUrl: string; descriptor: RoomDescriptor }
    | undefined {
    return this.joinedRooms.get(roomId);
  }

  forgetJoinedRoom(roomId: string): boolean {
    const removed = this.joinedRooms.delete(roomId);
    if (removed) void this.persist();
    return removed;
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          rooms: [...this.rooms.values()],
          joinedRooms: [...this.joinedRooms.values()],
        } satisfies RoomsFile);
      })
      .catch((error) => {
        console.warn(
          `[rooms] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
