import {
  buildChannelEntry,
  channelIdForTransaction,
  computeChannelHeadHash,
  createActionAnchor,
  verifyActionAnchor,
  type DisputeChannelEntry,
} from "@qwixl/a2a-transport/dispute-channel";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";

export interface DisputeChannelSnapshot {
  channelId: string;
  transactionId: string;
  entries: DisputeChannelEntry[];
  headHash: string;
  headSequence: number;
  anchors: Array<{
    objectId: string;
    issuerDid: string;
    headHash: string;
    headSequence: number;
    at: string;
  }>;
  updatedAt: string;
}

export interface DisputeChannelStoreDeps {
  localDid: string;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
}

interface PeerDelivery {
  peerUrl: string;
  peerDid?: string;
  encrypt?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class DisputeChannelStore {
  private readonly channels = new Map<string, DisputeChannelSnapshot>();

  constructor(private readonly deps: DisputeChannelStoreDeps) {}

  get(channelId: string): DisputeChannelSnapshot | undefined {
    return this.channels.get(channelId);
  }

  getByTransaction(transactionId: string): DisputeChannelSnapshot | undefined {
    return this.channels.get(channelIdForTransaction(transactionId));
  }

  list(): DisputeChannelSnapshot[] {
    return [...this.channels.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  appendFromObject(transactionId: string, object: DataObject): DisputeChannelSnapshot {
    const channelId = channelIdForTransaction(transactionId);
    const snapshot = this.channels.get(channelId) ?? {
      channelId,
      transactionId,
      entries: [],
      headHash: computeChannelHeadHash([]),
      headSequence: -1,
      anchors: [],
      updatedAt: nowIso(),
    };
    const entry = buildChannelEntry(object, snapshot.entries.length);
    snapshot.entries.push(entry);
    snapshot.headSequence = entry.sequence;
    snapshot.headHash = computeChannelHeadHash(snapshot.entries);
    snapshot.updatedAt = nowIso();
    this.channels.set(channelId, snapshot);
    return snapshot;
  }

  async anchor(params: {
    transactionId: string;
    note?: string;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<{ snapshot: DisputeChannelSnapshot; anchorObject: DataObject }> {
    const channelId = channelIdForTransaction(params.transactionId);
    const snapshot = this.channels.get(channelId);
    if (!snapshot || snapshot.entries.length === 0) {
      throw new Error(`No channel entries for transaction ${params.transactionId}`);
    }

    const anchorObject = await createActionAnchor({
      identity: this.deps.identity,
      payload: {
        channelId,
        headSequence: snapshot.headSequence,
        headHash: snapshot.headHash,
        entryCount: snapshot.entries.length,
        peerDid: params.peerDid,
        note: params.note,
      },
    });

    if (params.peerUrl?.trim()) {
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl: params.peerUrl.trim(),
        peerDid: params.peerDid?.trim(),
        object: anchorObject,
        encrypt: params.encrypt ?? false,
      });
    }

    snapshot.anchors.push({
      objectId: anchorObject.id,
      issuerDid: this.deps.localDid,
      headHash: snapshot.headHash,
      headSequence: snapshot.headSequence,
      at: nowIso(),
    });
    this.appendFromObject(params.transactionId, anchorObject);
    snapshot.updatedAt = nowIso();
    this.channels.set(channelId, snapshot);
    return { snapshot, anchorObject };
  }

  async handleInboxObject(object: DataObject): Promise<DisputeChannelSnapshot | undefined> {
    if (object.governance.purpose !== "action:anchor") return undefined;
    const { payload } = await verifyActionAnchor(object);
    const transactionId = payload.channelId.startsWith("txn:")
      ? payload.channelId.slice(4)
      : payload.channelId;
    const channelId = channelIdForTransaction(transactionId);
    const snapshot = this.channels.get(channelId) ?? {
      channelId,
      transactionId,
      entries: [],
      headHash: computeChannelHeadHash([]),
      headSequence: -1,
      anchors: [],
      updatedAt: nowIso(),
    };
    snapshot.anchors.push({
      objectId: object.id,
      issuerDid: object.issuerDid,
      headHash: payload.headHash,
      headSequence: payload.headSequence,
      at: object.issuedAt,
    });
    this.appendFromObject(transactionId, object);
    return snapshot;
  }
}
