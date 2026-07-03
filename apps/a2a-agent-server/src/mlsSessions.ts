import {
  bytesToBase64,
  base64ToBytes,
  MlsPairSession,
  deserializeRatchetTree,
  serializeRatchetTree,
  generatePairKeyPackage,
  type GeneratedKeyPackage,
  type MlsWireMessage,
} from "@qwixl/mls-session";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE, type AtomMlsHandshakeEnvelope } from "@qwixl/a2a-transport";

type PendingKeyPackage = GeneratedKeyPackage;

export function mlsContextId(peerDid: string): string {
  return `mls:${peerDid}`;
}

export function peerDidFromContext(contextId: string | undefined): string | undefined {
  if (!contextId?.startsWith("mls:")) return undefined;
  return contextId.slice(4);
}

export class MlsSessionStore {
  private readonly sessions = new Map<string, MlsPairSession>();
  private pending: PendingKeyPackage | null = null;

  listPeers(): string[] {
    return [...this.sessions.keys()];
  }

  hasSession(peerDid: string): boolean {
    return this.sessions.has(peerDid);
  }

  getSession(peerDid: string): MlsPairSession | undefined {
    return this.sessions.get(peerDid);
  }

  async keyPackageForHandshake(localDid: string): Promise<{ did: string; wire: string }> {
    if (!this.pending) {
      this.pending = await generatePairKeyPackage(localDid);
    }
    return { did: localDid, wire: bytesToBase64(this.pending.keyPackageWire) };
  }

  async connectAsInitiator(opts: {
    localDid: string;
    peerDid: string;
    peerKeyPackageWire: MlsWireMessage;
  }): Promise<AtomMlsHandshakeEnvelope> {
    if (this.sessions.has(opts.peerDid)) {
      throw new Error(`MLS session already exists for ${opts.peerDid}`);
    }
    const { session } = await MlsPairSession.createInitiator(opts.localDid);
    const welcomeWire = await session.addPeerFromKeyPackage({
      peerDid: opts.peerDid,
      keyPackageWire: opts.peerKeyPackageWire,
    });
    this.sessions.set(opts.peerDid, session);
    return {
      mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
      initiatorDid: opts.localDid,
      welcome: bytesToBase64(welcomeWire),
      ratchetTree: serializeRatchetTree(session.ratchetTree()),
    };
  }

  async acceptHandshake(opts: {
    localDid: string;
    handshake: AtomMlsHandshakeEnvelope;
  }): Promise<void> {
    if (!this.pending) {
      throw new Error("No pending key package — fetch /mls/key-package first");
    }
    if (this.sessions.has(opts.handshake.initiatorDid)) {
      throw new Error(`MLS session already exists for ${opts.handshake.initiatorDid}`);
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
    this.pending = null;
  }

  async decryptFrom(peerDid: string, wire: MlsWireMessage): Promise<Uint8Array> {
    const session = this.sessions.get(peerDid);
    if (!session) {
      throw new Error(`No MLS session for ${peerDid}`);
    }
    return session.decrypt(wire);
  }

  async encryptFor(peerDid: string, plaintext: Uint8Array): Promise<MlsWireMessage> {
    const session = this.sessions.get(peerDid);
    if (!session) {
      throw new Error(`No MLS session for ${peerDid}`);
    }
    return session.encrypt(plaintext);
  }
}

export function adminBaseFromPeerUrl(peerUrl: string): string {
  const url = new URL(peerUrl.replace(/\/$/, ""));
  return `${url.protocol}//${url.host}`;
}
