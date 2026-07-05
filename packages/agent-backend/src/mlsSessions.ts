import {
  bytesToBase64,
  base64ToBytes,
  MlsPairSession,
  MlsGroupSession,
  generateGroupMemberKeyPackage,
  generatePairKeyPackage,
  deserializeRatchetTree,
  serializeRatchetTree,
  serializeKeyPackages,
  deserializeKeyPackages,
  type GeneratedKeyPackage,
  type MlsGroupSnapshot,
  type MlsPairSnapshot,
  type MlsWireMessage,
} from "@qwixl/mls-session";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE, type AtomMlsHandshakeEnvelope } from "@qwixl/a2a-transport";
import type { KeyPackage, PrivateKeyPackage } from "ts-mls";
import type { MlsSessionRecordStore } from "./mlsSessionRecords.js";

type PendingKeyPackage = GeneratedKeyPackage;

export interface StoredPairPackages {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}

export function mlsContextId(peerDid: string): string {
  return `mls:${peerDid}`;
}

export function roomContextId(roomId: string): string {
  return `mls:room:${roomId}`;
}

export function peerDidFromContext(contextId: string | undefined): string | undefined {
  if (!contextId?.startsWith("mls:")) return undefined;
  if (contextId.startsWith("mls:room:")) return undefined;
  return contextId.slice(4);
}

export function roomIdFromContext(contextId: string | undefined): string | undefined {
  if (!contextId?.startsWith("mls:room:")) return undefined;
  return contextId.slice("mls:room:".length);
}

export class MlsSessionStore {
  private readonly sessions = new Map<string, MlsPairSession>();
  private readonly groupSessions = new Map<string, MlsGroupSession>();
  private readonly pairPackages = new Map<string, StoredPairPackages>();
  private readonly groupPackages = new Map<string, StoredPairPackages>();
  private pending: PendingKeyPackage | null = null;
  private records: MlsSessionRecordStore | null = null;

  attachRecords(records: MlsSessionRecordStore): void {
    this.records = records;
  }

  async loadFromRecords(records: MlsSessionRecordStore): Promise<void> {
    this.attachRecords(records);
    await records.load();
    for (const entry of records.listPairSessions()) {
      if (!entry.snapshot.peerDid) continue;
      try {
        const packages = deserializeKeyPackages(entry.packages);
        const session = MlsPairSession.restoreFromSnapshot(entry.snapshot, packages);
        this.sessions.set(entry.snapshot.peerDid, session);
        this.pairPackages.set(entry.snapshot.peerDid, packages);
      } catch (error) {
        console.warn(
          `[mls] failed to restore pair session for ${entry.snapshot.peerDid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const entry of records.listGroupSessions()) {
      try {
        const packages = deserializeKeyPackages(entry.packages);
        const session = MlsGroupSession.restoreFromSnapshot(entry.snapshot, packages);
        this.groupSessions.set(entry.snapshot.roomId, session);
        this.groupPackages.set(entry.snapshot.roomId, packages);
      } catch (error) {
        console.warn(
          `[mls] failed to restore group session for ${entry.snapshot.roomId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  listPeers(): string[] {
    return [...this.sessions.keys()];
  }

  listRooms(): string[] {
    return [...this.groupSessions.keys()];
  }

  hasSession(peerDid: string): boolean {
    return this.sessions.has(peerDid);
  }

  hasRoomSession(roomId: string): boolean {
    return this.groupSessions.has(roomId);
  }

  dropSession(peerDid: string): void {
    this.sessions.delete(peerDid);
    this.pairPackages.delete(peerDid);
    this.records?.deletePairSession(peerDid);
  }

  dropRoomSession(roomId: string): void {
    this.groupSessions.delete(roomId);
    this.groupPackages.delete(roomId);
    this.records?.deleteGroupSession(roomId);
  }

  getSession(peerDid: string): MlsPairSession | undefined {
    return this.sessions.get(peerDid);
  }

  getRoomSession(roomId: string): MlsGroupSession | undefined {
    return this.groupSessions.get(roomId);
  }

  private persistPair(peerDid: string, session: MlsPairSession): void {
    const packages = this.pairPackages.get(peerDid);
    if (!packages || !this.records) return;
    this.records.setPairSession({
      snapshot: session.exportSnapshot(),
      packages: serializeKeyPackages(packages),
    });
  }

  private persistGroup(roomId: string, session: MlsGroupSession): void {
    const packages = this.groupPackages.get(roomId);
    if (!packages || !this.records) return;
    this.records.setGroupSession({
      snapshot: session.exportSnapshot(),
      packages: serializeKeyPackages(packages),
    });
  }

  async keyPackageForHandshake(localDid: string): Promise<{ did: string; wire: string }> {
    if (!this.pending) {
      this.pending = await generatePairKeyPackage(localDid);
    }
    return { did: localDid, wire: bytesToBase64(this.pending.keyPackageWire) };
  }

  async memberKeyPackage(localDid: string): Promise<{
    wire: MlsWireMessage;
    packages: StoredPairPackages;
  }> {
    const generated = await generateGroupMemberKeyPackage(localDid);
    return {
      wire: generated.keyPackageWire,
      packages: {
        publicPackage: generated.publicPackage,
        privatePackage: generated.privatePackage,
      },
    };
  }

  async connectAsInitiator(opts: {
    localDid: string;
    peerDid: string;
    peerKeyPackageWire: MlsWireMessage;
    initiatorEndpoint?: string;
  }): Promise<AtomMlsHandshakeEnvelope> {
    if (this.sessions.has(opts.peerDid)) {
      throw new Error(`MLS session already exists for ${opts.peerDid}`);
    }
    const { session, bundle } = await MlsPairSession.createInitiator(opts.localDid);
    const welcomeWire = await session.addPeerFromKeyPackage({
      peerDid: opts.peerDid,
      keyPackageWire: opts.peerKeyPackageWire,
    });
    this.sessions.set(opts.peerDid, session);
    this.pairPackages.set(opts.peerDid, {
      publicPackage: bundle.publicPackage,
      privatePackage: bundle.privatePackage,
    });
    this.persistPair(opts.peerDid, session);
    return {
      mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
      initiatorDid: opts.localDid,
      welcome: bytesToBase64(welcomeWire),
      ratchetTree: serializeRatchetTree(session.ratchetTree()),
      ...(opts.initiatorEndpoint?.trim()
        ? { initiatorEndpoint: opts.initiatorEndpoint.trim() }
        : {}),
    };
  }

  async acceptHandshake(opts: {
    localDid: string;
    handshake: AtomMlsHandshakeEnvelope;
  }): Promise<void> {
    if (this.sessions.has(opts.handshake.initiatorDid)) {
      return;
    }
    if (!this.pending) {
      throw new Error("No pending key package — fetch /mls/key-package first");
    }
    const session = await MlsPairSession.joinFromWelcome({
      localDid: opts.localDid,
      welcomeWire: base64ToBytes(opts.handshake.welcome),
      ratchetTree: deserializeRatchetTree(opts.handshake.ratchetTree),
      publicPackage: this.pending.publicPackage,
      privatePackage: this.pending.privatePackage,
    });
    session.peerDid = opts.handshake.initiatorDid;
    this.sessions.set(opts.handshake.initiatorDid, session);
    this.pairPackages.set(opts.handshake.initiatorDid, {
      publicPackage: this.pending.publicPackage,
      privatePackage: this.pending.privatePackage,
    });
    this.persistPair(opts.handshake.initiatorDid, session);
    this.pending = null;
  }

  async createRoomHost(opts: { localDid: string; roomId: string }): Promise<MlsGroupSession> {
    if (this.groupSessions.has(opts.roomId)) {
      return this.groupSessions.get(opts.roomId)!;
    }
    const { session, publicPackage, privatePackage } = await MlsGroupSession.createHost(opts);
    const packages = { publicPackage, privatePackage };
    this.groupSessions.set(opts.roomId, session);
    this.groupPackages.set(opts.roomId, packages);
    this.persistGroup(opts.roomId, session);
    return session;
  }

  async addRoomMember(opts: {
    roomId: string;
    memberDid: string;
    keyPackageWire: MlsWireMessage;
  }): Promise<AtomMlsHandshakeEnvelope & { memberDids: string[] }> {
    const session = this.groupSessions.get(opts.roomId);
    if (!session) {
      throw new Error(`No MLS group session for room ${opts.roomId}`);
    }
    const welcomeWire = await session.addMember({
      memberDid: opts.memberDid,
      keyPackageWire: opts.keyPackageWire,
    });
    this.persistGroup(opts.roomId, session);
    return {
      mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
      initiatorDid: session.localDid,
      welcome: bytesToBase64(welcomeWire),
      ratchetTree: serializeRatchetTree(session.ratchetTree()),
      memberDids: [...session.memberDids],
    };
  }

  async joinRoom(opts: {
    localDid: string;
    roomId: string;
    handshake: AtomMlsHandshakeEnvelope & { memberDids?: string[] };
    memberPackages: StoredPairPackages;
  }): Promise<void> {
    if (this.groupSessions.has(opts.roomId)) {
      return;
    }
    const session = await MlsGroupSession.joinFromWelcome({
      localDid: opts.localDid,
      roomId: opts.roomId,
      welcomeWire: base64ToBytes(opts.handshake.welcome),
      ratchetTree: deserializeRatchetTree(opts.handshake.ratchetTree),
      publicPackage: opts.memberPackages.publicPackage,
      privatePackage: opts.memberPackages.privatePackage,
      memberDids: opts.handshake.memberDids ?? [opts.handshake.initiatorDid, opts.localDid],
    });
    this.groupSessions.set(opts.roomId, session);
    this.groupPackages.set(opts.roomId, opts.memberPackages);
    this.persistGroup(opts.roomId, session);
  }

  async decryptFrom(peerDid: string, wire: MlsWireMessage): Promise<Uint8Array> {
    const session = this.sessions.get(peerDid);
    if (!session) {
      throw new Error(`No MLS session for ${peerDid}`);
    }
    const plaintext = await session.decrypt(wire);
    this.persistPair(peerDid, session);
    return plaintext;
  }

  async encryptFor(peerDid: string, plaintext: Uint8Array): Promise<MlsWireMessage> {
    const session = this.sessions.get(peerDid);
    if (!session) {
      throw new Error(`No MLS session for ${peerDid}`);
    }
    const wire = await session.encrypt(plaintext);
    this.persistPair(peerDid, session);
    return wire;
  }

  async decryptRoom(roomId: string, wire: MlsWireMessage): Promise<Uint8Array> {
    const session = this.groupSessions.get(roomId);
    if (!session) {
      throw new Error(`No MLS group session for room ${roomId}`);
    }
    const plaintext = await session.decrypt(wire);
    this.persistGroup(roomId, session);
    return plaintext;
  }

  async encryptRoom(roomId: string, plaintext: Uint8Array): Promise<MlsWireMessage> {
    const session = this.groupSessions.get(roomId);
    if (!session) {
      throw new Error(`No MLS group session for room ${roomId}`);
    }
    const wire = await session.encrypt(plaintext);
    this.persistGroup(roomId, session);
    return wire;
  }
}

export function adminBaseFromPeerUrl(peerUrl: string): string {
  const url = new URL(peerUrl.replace(/\/$/, ""));
  return `${url.protocol}//${url.host}`;
}

export function parseRoomPayload(plaintext: Uint8Array): {
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
} {
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
    kind?: string;
    text?: string;
    activityKind?: string;
    payload?: Record<string, unknown>;
  };
  if (parsed.kind !== "message" && parsed.kind !== "activity") {
    throw new Error("Invalid room payload kind");
  }
  return parsed as {
    kind: "message" | "activity";
    text?: string;
    activityKind?: string;
    payload?: Record<string, unknown>;
  };
}

export function encodeRoomPayload(payload: {
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  payload?: Record<string, unknown>;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}
