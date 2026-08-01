import type { AgentKeyPair } from "@qwixl/protocol";
import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeMlsMessage,
  emptyPskIndex,
  encodeMlsMessage,
  joinGroup,
  processPublicMessage,
  type ClientState,
  type GroupState,
  type KeyPackage,
  type PrivateKeyPackage,
  type Proposal,
  zeroOutUint8Array,
} from "ts-mls";
import {
  decodeGroupState,
  decodeGroupStateWithoutTree,
  encodeGroupStateWithoutTree,
} from "ts-mls/clientState.js";
import {
  getCredentialFromLeafIndex,
} from "ts-mls/ratchetTree.js";
import { toLeafIndex } from "ts-mls/treemath.js";
import { defaultCiphersuite } from "./ciphersuite.js";
import {
  assertKeyPackageCredentialBinding,
  credentialIdentityDid,
  generateBoundKeyPackage,
} from "./credential.js";
import { decryptApplicationMessage, type DecryptedMlsApplication } from "./decrypt.js";
import { hydrateClientState } from "./clientStateRestore.js";
import { bytesToBase64, base64ToBytes } from "./pairSession.js";
import { deserializeRatchetTree, serializeRatchetTree } from "./ratchetTree.js";
import type { MlsGroupSnapshot } from "./snapshot.js";
import type { MlsWireMessage } from "./types.js";

function randomGroupId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export interface MlsGroupMembershipChange {
  /** Welcome for the new member (add only). */
  welcomeWire?: MlsWireMessage;
  /** Public commit for existing members (D135 / MLS-01 fan-out). */
  commitWire: MlsWireMessage;
  memberDids: string[];
}

function findLeafIndexForDid(groupState: ClientState, did: string): number {
  const tree = groupState.ratchetTree;
  for (let nodeIndex = 0; nodeIndex < tree.length; nodeIndex += 2) {
    const node = tree[nodeIndex];
    if (!node || node.nodeType !== "leaf") continue;
    const leafIndex = toLeafIndex(nodeIndex / 2);
    try {
      if (credentialIdentityDid(getCredentialFromLeafIndex(tree, leafIndex)) === did) {
        return nodeIndex / 2;
      }
    } catch {
      /* blank / unreadable leaf */
    }
  }
  throw new Error(`No MLS leaf for DID ${did}`);
}

function memberDidsFromTree(groupState: ClientState): string[] {
  const dids: string[] = [];
  const tree = groupState.ratchetTree;
  for (let nodeIndex = 0; nodeIndex < tree.length; nodeIndex += 2) {
    const node = tree[nodeIndex];
    if (!node || node.nodeType !== "leaf") continue;
    const leafIndex = toLeafIndex(nodeIndex / 2);
    try {
      dids.push(credentialIdentityDid(getCredentialFromLeafIndex(tree, leafIndex)));
    } catch {
      /* blank / unreadable leaf */
    }
  }
  return dids;
}

/** True when wire is an MLS public message (commit fan-out). */
export function isMlsPublicMessageWire(wire: MlsWireMessage): boolean {
  const decoded = decodeMlsMessage(wire, 0)?.[0];
  return decoded?.wireformat === "mls_public_message";
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
    identity: AgentKeyPair;
    roomId: string;
  }): Promise<{
    session: MlsGroupSession;
    hostKeyPackageWire: MlsWireMessage;
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
  }> {
    const kp = await generateBoundKeyPackage(opts.identity);
    const impl = await defaultCiphersuite();
    const groupState = await createGroup(
      randomGroupId(),
      kp.publicPackage,
      kp.privatePackage,
      [],
      impl,
    );
    return {
      session: new MlsGroupSession({
        groupState,
        publicPackage: kp.publicPackage,
        privatePackage: kp.privatePackage,
        localDid: opts.identity.did,
        roomId: opts.roomId,
        memberDids: [opts.identity.did],
      }),
      hostKeyPackageWire: kp.keyPackageWire,
      publicPackage: kp.publicPackage,
      privatePackage: kp.privatePackage,
    };
  }

  /**
   * Host: add a member from their key package.
   * Returns Welcome for the joiner and a public commit for existing members (D135).
   */
  async addMember(opts: {
    memberDid: string;
    keyPackageWire: MlsWireMessage;
  }): Promise<MlsGroupMembershipChange> {
    if (this.memberDids.includes(opts.memberDid)) {
      throw new Error(`Member ${opts.memberDid} already in room`);
    }
    const impl = await defaultCiphersuite();
    const decoded = decodeMlsMessage(opts.keyPackageWire, 0)?.[0];
    if (!decoded || decoded.wireformat !== "mls_key_package") {
      throw new Error("Expected MLS KeyPackage message");
    }
    assertKeyPackageCredentialBinding(decoded.keyPackage, opts.memberDid);
    const addProposal: Proposal = {
      proposalType: "add",
      add: { keyPackage: decoded.keyPackage },
    };
    const commitResult = await createCommit(
      { state: this.groupState, cipherSuite: impl },
      { extraProposals: [addProposal], wireAsPublicMessage: true },
    );
    this.groupState = commitResult.newState;
    commitResult.consumed.forEach(zeroOutUint8Array);
    if (!commitResult.welcome) {
      throw new Error("MLS commit did not produce Welcome");
    }
    (this.memberDids as string[]).push(opts.memberDid);
    return {
      welcomeWire: encodeMlsMessage({
        welcome: commitResult.welcome,
        wireformat: "mls_welcome",
        version: "mls10",
      }),
      commitWire: encodeMlsMessage(commitResult.commit),
      memberDids: [...this.memberDids],
    };
  }

  /**
   * Host: remove a member by DID (MLS remove proposal + public commit).
   * Existing remaining members must process `commitWire` (D135 / 3B).
   */
  async removeMember(opts: { memberDid: string }): Promise<MlsGroupMembershipChange> {
    if (opts.memberDid === this.localDid) {
      throw new Error("Host cannot remove itself via removeMember");
    }
    if (!this.memberDids.includes(opts.memberDid)) {
      throw new Error(`Member ${opts.memberDid} not in room`);
    }
    const impl = await defaultCiphersuite();
    const removed = findLeafIndexForDid(this.groupState, opts.memberDid);
    const removeProposal: Proposal = {
      proposalType: "remove",
      remove: { removed },
    };
    const commitResult = await createCommit(
      { state: this.groupState, cipherSuite: impl },
      { extraProposals: [removeProposal], wireAsPublicMessage: true },
    );
    this.groupState = commitResult.newState;
    commitResult.consumed.forEach(zeroOutUint8Array);
    const next = this.memberDids.filter((did) => did !== opts.memberDid);
    (this.memberDids as string[]).length = 0;
    (this.memberDids as string[]).push(...next);
    return {
      commitWire: encodeMlsMessage(commitResult.commit),
      memberDids: [...this.memberDids],
    };
  }

  /**
   * Existing member: apply a public commit from the host (add/remove fan-out).
   */
  async processCommit(commitWire: MlsWireMessage): Promise<void> {
    const impl = await defaultCiphersuite();
    const decoded = decodeMlsMessage(commitWire, 0)?.[0];
    if (!decoded || decoded.wireformat !== "mls_public_message") {
      throw new Error("Expected MLS public commit message");
    }
    const processed = await processPublicMessage(
      this.groupState,
      decoded.publicMessage,
      emptyPskIndex,
      impl,
    );
    this.groupState = processed.newState;
    processed.consumed.forEach(zeroOutUint8Array);
    const next = memberDidsFromTree(this.groupState);
    (this.memberDids as string[]).length = 0;
    (this.memberDids as string[]).push(...next);
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

  async decrypt(wire: MlsWireMessage): Promise<DecryptedMlsApplication> {
    const { result, newState } = await decryptApplicationMessage({
      groupState: this.groupState,
      wire,
    });
    this.groupState = newState;
    return result;
  }

  exportSnapshot(): MlsGroupSnapshot {
    return {
      version: 1,
      localDid: this.localDid,
      roomId: this.roomId,
      memberDids: [...this.memberDids],
      groupStateB64: bytesToBase64(encodeGroupStateWithoutTree(this.groupState)),
      ratchetTreeB64: serializeRatchetTree(this.groupState.ratchetTree),
    };
  }

  static restoreFromSnapshot(
    snap: MlsGroupSnapshot,
    packages: { publicPackage: KeyPackage; privatePackage: PrivateKeyPackage },
  ): MlsGroupSession {
    if (snap.version !== 1) {
      throw new Error(`Unsupported MLS group snapshot version ${snap.version}`);
    }
    let groupState: ClientState;
    if (snap.ratchetTreeB64) {
      const tree = deserializeRatchetTree(snap.ratchetTreeB64);
      const decoded = decodeGroupStateWithoutTree(tree)(
        base64ToBytes(snap.groupStateB64),
        0,
      );
      if (!decoded) {
        throw new Error("Invalid MLS group snapshot group state (without tree)");
      }
      groupState = hydrateClientState(decoded[0] as ClientState);
    } else {
      const decoded = decodeGroupState(base64ToBytes(snap.groupStateB64), 0);
      if (!decoded) {
        throw new Error("Invalid MLS group snapshot group state");
      }
      groupState = hydrateClientState(decoded[0] as ClientState);
    }
    const memberDids = memberDidsFromTree(groupState);
    return new MlsGroupSession({
      groupState,
      publicPackage: packages.publicPackage,
      privatePackage: packages.privatePackage,
      localDid: snap.localDid,
      roomId: snap.roomId,
      memberDids: memberDids.length > 0 ? memberDids : snap.memberDids,
    });
  }
}

export async function generateGroupMemberKeyPackage(identity: AgentKeyPair): Promise<{
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
  keyPackageWire: MlsWireMessage;
}> {
  return generateBoundKeyPackage(identity);
}
