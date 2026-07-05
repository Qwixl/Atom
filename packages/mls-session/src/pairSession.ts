import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  generateKeyPackage,
  joinGroup,
  processPrivateMessage,
  type Credential,
  type ClientState,
  type GroupState,
  type KeyPackage,
  type PrivateKeyPackage,
  type Proposal,
  zeroOutUint8Array,
} from "ts-mls";
import { defaultCiphersuite } from "./ciphersuite.js";
import { hydrateClientState } from "./clientStateRestore.js";
import type { MlsPairSnapshot } from "./snapshot.js";
import type { MlsWireMessage } from "./types.js";

function didCredential(did: string): Credential {
  return { credentialType: "basic", identity: new TextEncoder().encode(did) };
}

function randomGroupId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export interface InitiatorBundle {
  keyPackageWire: MlsWireMessage;
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}

export class MlsPairSession {
  private groupState: ClientState;
  private readonly publicPackage: KeyPackage;
  private readonly privatePackage: PrivateKeyPackage;
  readonly localDid: string;
  peerDid: string | null;

  private constructor(opts: {
    groupState: ClientState;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
    localDid: string;
    peerDid: string | null;
  }) {
    this.groupState = opts.groupState;
    this.publicPackage = opts.publicPackage;
    this.privatePackage = opts.privatePackage;
    this.localDid = opts.localDid;
    this.peerDid = opts.peerDid;
  }

  /** Create a new 1:1 MLS group and export the initiator key package for the peer. */
  static async createInitiator(localDid: string): Promise<{
    session: MlsPairSession;
    bundle: InitiatorBundle;
  }> {
    const impl = await defaultCiphersuite();
    const kp = await generateKeyPackage(
      didCredential(localDid),
      defaultCapabilities(),
      defaultLifetime,
      [],
      impl,
    );
    const groupId = randomGroupId();
    const groupState = await createGroup(
      groupId,
      kp.publicPackage,
      kp.privatePackage,
      [],
      impl,
    );
    const keyPackageWire = encodeMlsMessage({
      keyPackage: kp.publicPackage,
      wireformat: "mls_key_package",
      version: "mls10",
    });
    return {
      session: new MlsPairSession({
        groupState,
        publicPackage: kp.publicPackage,
        privatePackage: kp.privatePackage,
        localDid,
        peerDid: null,
      }),
      bundle: {
        keyPackageWire,
        publicPackage: kp.publicPackage,
        privatePackage: kp.privatePackage,
      },
    };
  }

  /** Responder: join from a Welcome after the initiator added this agent. */
  static async joinFromWelcome(opts: {
    localDid: string;
    welcomeWire: MlsWireMessage;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
    ratchetTree?: GroupState["ratchetTree"];
  }): Promise<MlsPairSession> {
    const impl = await defaultCiphersuite();
    const decoded = decodeMlsMessage(opts.welcomeWire, 0)?.[0];
    if (!decoded || decoded.wireformat !== "mls_welcome") {
      throw new Error("Expected MLS Welcome message");
    }
    const groupState = await joinGroup(
      decoded.welcome,
      opts.publicPackage,
      opts.privatePackage,
      emptyPskIndex,
      impl,
      opts.ratchetTree,
    );
    return new MlsPairSession({
      groupState,
      publicPackage: opts.publicPackage,
      privatePackage: opts.privatePackage,
      localDid: opts.localDid,
      peerDid: null,
    });
  }

  /** Initiator: add peer from their key package wire; returns Welcome for the peer. */
  async addPeerFromKeyPackage(opts: {
    peerDid: string;
    keyPackageWire: MlsWireMessage;
  }): Promise<MlsWireMessage> {
    const impl = await defaultCiphersuite();
    const decoded = decodeMlsMessage(opts.keyPackageWire, 0)?.[0];
    if (!decoded || decoded.wireformat !== "mls_key_package") {
      throw new Error("Expected MLS KeyPackage message");
    }
    const addProposal: Proposal = {
      proposalType: "add",
      add: { keyPackage: decoded.keyPackage },
    };
    const commitResult = await createCommit(
      { state: this.groupState, cipherSuite: impl },
      { extraProposals: [addProposal] },
    );
    this.groupState = commitResult.newState;
    commitResult.consumed.forEach(zeroOutUint8Array);
    this.peerDid = opts.peerDid;
    if (!commitResult.welcome) {
      throw new Error("MLS commit did not produce Welcome");
    }
    return encodeMlsMessage({
      welcome: commitResult.welcome,
      wireformat: "mls_welcome",
      version: "mls10",
    });
  }

  ratchetTree(): GroupState["ratchetTree"] {
    return this.groupState.ratchetTree;
  }

  async encrypt(plaintext: Uint8Array): Promise<MlsWireMessage> {
    const impl = await defaultCiphersuite();
    const result = await createApplicationMessage(this.groupState, plaintext, impl);
    this.groupState = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    return encodeMlsMessage({
      privateMessage: result.privateMessage,
      wireformat: "mls_private_message",
      version: "mls10",
    });
  }

  async decrypt(wire: MlsWireMessage): Promise<Uint8Array> {
    const impl = await defaultCiphersuite();
    const decoded = decodeMlsMessage(wire, 0)?.[0];
    if (!decoded || decoded.wireformat !== "mls_private_message") {
      throw new Error("Expected MLS private message");
    }
    const result = await processPrivateMessage(
      this.groupState,
      decoded.privateMessage,
      emptyPskIndex,
      impl,
    );
    this.groupState = result.newState;
    result.consumed.forEach(zeroOutUint8Array);
    if (result.kind !== "applicationMessage") {
      throw new Error(`Unexpected MLS message kind: ${String(result.kind)}`);
    }
    return result.message;
  }

  exportSnapshot(): MlsPairSnapshot {
    return {
      version: 1,
      localDid: this.localDid,
      peerDid: this.peerDid,
      groupStateB64: bytesToBase64(encodeGroupState(this.groupState)),
    };
  }

  /** Restore an established pair session from persisted group state. */
  static restoreFromSnapshot(
    snap: MlsPairSnapshot,
    packages: { publicPackage: KeyPackage; privatePackage: PrivateKeyPackage },
  ): MlsPairSession {
    if (snap.version !== 1) {
      throw new Error(`Unsupported MLS pair snapshot version ${snap.version}`);
    }
    const decoded = decodeGroupState(base64ToBytes(snap.groupStateB64), 0);
    if (!decoded) {
      throw new Error("Invalid MLS pair snapshot group state");
    }
    return new MlsPairSession({
      groupState: hydrateClientState(decoded[0] as ClientState),
      publicPackage: packages.publicPackage,
      privatePackage: packages.privatePackage,
      localDid: snap.localDid,
      peerDid: snap.peerDid,
    });
  }
}

/** Full 1:1 handshake: initiator + responder sessions and welcome wire. */
export async function establishPairSession(opts: {
  initiatorDid: string;
  responderDid: string;
}): Promise<{
  initiator: MlsPairSession;
  responder: MlsPairSession;
}> {
  const { session: initiator, bundle: initiatorBundle } =
    await MlsPairSession.createInitiator(opts.initiatorDid);

  const impl = await defaultCiphersuite();
  const responderKp = await generateKeyPackage(
    didCredential(opts.responderDid),
    defaultCapabilities(),
    defaultLifetime,
    [],
    impl,
  );
  const responderKeyPackageWire = encodeMlsMessage({
    keyPackage: responderKp.publicPackage,
    wireformat: "mls_key_package",
    version: "mls10",
  });

  const welcomeWire = await initiator.addPeerFromKeyPackage({
    peerDid: opts.responderDid,
    keyPackageWire: responderKeyPackageWire,
  });

  const responder = await MlsPairSession.joinFromWelcome({
    localDid: opts.responderDid,
    welcomeWire,
    publicPackage: responderKp.publicPackage,
    privatePackage: responderKp.privatePackage,
    ratchetTree: initiator.ratchetTree(),
  });
  responder.peerDid = opts.initiatorDid;

  return { initiator, responder };
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}
