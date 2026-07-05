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
  type ClientState,
  type Credential,
  type GroupState,
  type KeyPackage,
  type PrivateKeyPackage,
  type Proposal,
  zeroOutUint8Array,
} from "ts-mls";
import { defaultCiphersuite } from "./ciphersuite.js";
import { hydrateClientState } from "./clientStateRestore.js";
import { bytesToBase64, base64ToBytes } from "./pairSession.js";
import type { MlsGroupSnapshot } from "./snapshot.js";
import type { MlsWireMessage } from "./types.js";

function didCredential(did: string): Credential {
  return { credentialType: "basic", identity: new TextEncoder().encode(did) };
}

function randomGroupId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export class MlsGroupSession {
  private groupState: ClientState;
  private readonly publicPackage: KeyPackage;
  private readonly privatePackage: PrivateKeyPackage;
  readonly localDid: string;
  readonly roomId: string;
  readonly memberDids: string[];

  private constructor(opts: {
    groupState: ClientState;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
    localDid: string;
    roomId: string;
    memberDids: string[];
  }) {
    this.groupState = opts.groupState;
    this.publicPackage = opts.publicPackage;
    this.privatePackage = opts.privatePackage;
    this.localDid = opts.localDid;
    this.roomId = opts.roomId;
    this.memberDids = opts.memberDids;
  }

  /** Host: create a new MLS group for a room (host is the first member). */
  static async createHost(opts: {
    localDid: string;
    roomId: string;
  }): Promise<{
    session: MlsGroupSession;
    hostKeyPackageWire: MlsWireMessage;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
  }> {
    const impl = await defaultCiphersuite();
    const kp = await generateKeyPackage(
      didCredential(opts.localDid),
      defaultCapabilities(),
      defaultLifetime,
      [],
      impl,
    );
    const groupState = await createGroup(
      randomGroupId(),
      kp.publicPackage,
      kp.privatePackage,
      [],
      impl,
    );
    const hostKeyPackageWire = encodeMlsMessage({
      keyPackage: kp.publicPackage,
      wireformat: "mls_key_package",
      version: "mls10",
    });
    return {
      session: new MlsGroupSession({
        groupState,
        publicPackage: kp.publicPackage,
        privatePackage: kp.privatePackage,
        localDid: opts.localDid,
        roomId: opts.roomId,
        memberDids: [opts.localDid],
      }),
      hostKeyPackageWire,
      publicPackage: kp.publicPackage,
      privatePackage: kp.privatePackage,
    };
  }

  /** Host: add a member from their key package; returns Welcome for the new member. */
  async addMember(opts: {
    memberDid: string;
    keyPackageWire: MlsWireMessage;
  }): Promise<MlsWireMessage> {
    if (this.memberDids.includes(opts.memberDid)) {
      throw new Error(`Member ${opts.memberDid} already in room`);
    }
    this.groupState = hydrateClientState(this.groupState);
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
    this.groupState = hydrateClientState(commitResult.newState as ClientState);
    commitResult.consumed.forEach(zeroOutUint8Array);
    if (!commitResult.welcome) {
      throw new Error("MLS commit did not produce Welcome");
    }
    (this.memberDids as string[]).push(opts.memberDid);
    return encodeMlsMessage({
      welcome: commitResult.welcome,
      wireformat: "mls_welcome",
      version: "mls10",
    });
  }

  /** Member: join from Welcome after the host added this agent. */
  static async joinFromWelcome(opts: {
    localDid: string;
    roomId: string;
    welcomeWire: MlsWireMessage;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
    ratchetTree?: GroupState["ratchetTree"];
    memberDids: string[];
  }): Promise<MlsGroupSession> {
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
    return new MlsGroupSession({
      groupState: hydrateClientState(groupState as ClientState),
      publicPackage: opts.publicPackage,
      privatePackage: opts.privatePackage,
      localDid: opts.localDid,
      roomId: opts.roomId,
      memberDids: opts.memberDids,
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

  exportSnapshot(): MlsGroupSnapshot {
    return {
      version: 1,
      localDid: this.localDid,
      roomId: this.roomId,
      memberDids: [...this.memberDids],
      groupStateB64: bytesToBase64(encodeGroupState(this.groupState)),
    };
  }

  static restoreFromSnapshot(
    snap: MlsGroupSnapshot,
    packages: { publicPackage: KeyPackage; privatePackage: PrivateKeyPackage },
  ): MlsGroupSession {
    if (snap.version !== 1) {
      throw new Error(`Unsupported MLS group snapshot version ${snap.version}`);
    }
    const decoded = decodeGroupState(base64ToBytes(snap.groupStateB64), 0);
    if (!decoded) {
      throw new Error("Invalid MLS group snapshot group state");
    }
    return new MlsGroupSession({
      groupState: hydrateClientState(decoded[0] as ClientState),
      publicPackage: packages.publicPackage,
      privatePackage: packages.privatePackage,
      localDid: snap.localDid,
      roomId: snap.roomId,
      memberDids: snap.memberDids,
    });
  }
}

export async function generateGroupMemberKeyPackage(localDid: string): Promise<{
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
  keyPackageWire: MlsWireMessage;
}> {
  const impl = await defaultCiphersuite();
  const kp = await generateKeyPackage(
    didCredential(localDid),
    defaultCapabilities(),
    defaultLifetime,
    [],
    impl,
  );
  return {
    publicPackage: kp.publicPackage,
    privatePackage: kp.privatePackage,
    keyPackageWire: encodeMlsMessage({
      keyPackage: kp.publicPackage,
      wireformat: "mls_key_package",
      version: "mls10",
    }),
  };
}
