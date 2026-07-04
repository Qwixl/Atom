import {
  createActionQualify,
  verifyActionQualify,
  type ActionQualifyPayload,
  type QualifyClaimSummary,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";

export interface QualifyRecord {
  subjectId: string;
  transactionId?: string;
  objectId: string;
  issuerDid: string;
  verificationMethod: string;
  claims: QualifyClaimSummary;
  attestationRef: string;
  receivedAt: string;
  direction: "outbound" | "inbound";
}

export interface QualifyStoreDeps {
  localDid: string;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  onQualifyObject?: (object: DataObject) => void;
}

interface PeerDelivery {
  peerUrl: string;
  peerDid?: string;
  encrypt?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class QualifyStore {
  private readonly records = new Map<string, QualifyRecord[]>();

  constructor(private readonly deps: QualifyStoreDeps) {}

  list(subjectId?: string): QualifyRecord[] {
    if (subjectId) {
      return [...(this.records.get(subjectId) ?? [])];
    }
    return [...this.records.values()].flat().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async present(params: {
    payload: ActionQualifyPayload;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<{ object: DataObject; record: QualifyRecord }> {
    const object = await createActionQualify({
      identity: this.deps.identity,
      payload: params.payload,
    });
    if (params.peerUrl?.trim()) {
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl: params.peerUrl.trim(),
        peerDid: params.peerDid?.trim(),
        object,
        encrypt: params.encrypt ?? false,
      });
    }
    const record = this.storeRecord(object, "outbound");
    this.deps.onQualifyObject?.(object);
    return { object, record };
  }

  async handleInboxObject(object: DataObject): Promise<QualifyRecord | undefined> {
    if (object.governance.purpose !== "action:qualify") return undefined;
    const { payload } = await verifyActionQualify(object);
    const record = this.storeRecord(object, "inbound", payload);
    this.deps.onQualifyObject?.(object);
    return record;
  }

  private storeRecord(
    object: DataObject,
    direction: "outbound" | "inbound",
    payload?: ActionQualifyPayload,
  ): QualifyRecord {
    const p = payload ?? (object.payload as unknown as ActionQualifyPayload);
    const record: QualifyRecord = {
      subjectId: p.subjectId,
      transactionId: p.transactionId,
      objectId: object.id,
      issuerDid: object.issuerDid,
      verificationMethod: p.verificationMethod,
      claims: p.claims,
      attestationRef: p.attestationRef,
      receivedAt: nowIso(),
      direction,
    };
    const list = this.records.get(p.subjectId) ?? [];
    list.push(record);
    this.records.set(p.subjectId, list);
    return record;
  }
}
