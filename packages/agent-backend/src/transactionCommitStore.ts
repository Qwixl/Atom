import {
  createActionCapture,
  createActionConfirm,
  createActionHold,
  createActionReceipt,
  createActionRelease,
  verifyActionConfirm,
  verifyActionHold,
  type MonetaryAmount,
  type ReleaseReason,
  type TransactionPartyRole,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { PaymentRail } from "./payment/types.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

export type TransactionCommitPhase =
  | "awaiting_payee_confirm"
  | "awaiting_capture"
  | "captured"
  | "released"
  | "expired";

export interface PartyConfirmRecord {
  attestationRef: string;
  objectId: string;
  issuerDid: string;
  at: string;
}

export interface TransactionCommitRecord {
  transactionId: string;
  localRole: TransactionPartyRole;
  peerDid: string;
  peerUrl?: string;
  phase: TransactionCommitPhase;
  amount: MonetaryAmount;
  label?: string;
  subjectId?: string;
  holdObjectId: string;
  railRef: string;
  rail: string;
  expiresAt?: string;
  payerConfirm?: PartyConfirmRecord;
  payeeConfirm?: PartyConfirmRecord;
  captureAttestationRef?: string;
  updatedAt: string;
}

export interface TransactionCommitStoreDeps {
  localDid: string;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  resolveRail: () => PaymentRail;
  /** M11.7 — append signed objects to bilateral dispute channel. */
  recordChannelObject?: (transactionId: string, object: DataObject) => void;
}

interface PeerDelivery {
  peerUrl: string;
  peerDid?: string;
  encrypt?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class TransactionCommitStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.transactionCommit;
  private readonly records = new Map<string, TransactionCommitRecord>();

  constructor(private readonly deps: TransactionCommitStoreDeps) {}

  list(): TransactionCommitRecord[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(transactionId: string): TransactionCommitRecord | undefined {
    return this.records.get(transactionId);
  }

  async sweepExpired(): Promise<void> {
    const now = Date.now();
    for (const record of this.records.values()) {
      if (record.phase === "captured" || record.phase === "released" || record.phase === "expired") {
        continue;
      }
      if (!record.expiresAt) continue;
      if (Date.parse(record.expiresAt) > now) continue;
      await this.releaseRecord(record, "timeout", "Hold expired before capture");
    }
  }

  async offerHold(params: {
    transactionId: string;
    peerUrl: string;
    peerDid?: string;
    attestationRef: string;
    paymentMethodId: string;
    amount: MonetaryAmount;
    label?: string;
    subjectId?: string;
    encrypt?: boolean;
  }): Promise<TransactionCommitRecord> {
    await this.sweepExpired();
    if (this.records.has(params.transactionId)) {
      throw new Error(`Transaction already exists: ${params.transactionId}`);
    }

    const rail = this.deps.resolveRail();
    const hold = await rail.placeHold({
      transactionId: params.transactionId,
      amount: params.amount,
      paymentMethodId: params.paymentMethodId,
      idempotencyKey: `hold-${params.transactionId}`,
    });

    const holdObject = await createActionHold({
      identity: this.deps.identity,
      payload: {
        transactionId: params.transactionId,
        railRef: hold.railRef,
        rail: hold.rail,
        amount: hold.amount,
        attestationRef: params.attestationRef,
        subjectId: params.subjectId,
        label: params.label,
        peerDid: params.peerDid,
        expiresAt: hold.expiresAt,
      },
    });

    const delivery: PeerDelivery = {
      peerUrl: params.peerUrl,
      peerDid: params.peerDid,
      encrypt: params.encrypt,
    };
    await this.deliverObject(holdObject, delivery);
    this.recordChannel(params.transactionId, holdObject);

    const payerConfirmObject = await this.buildConfirmObject({
      transactionId: params.transactionId,
      holdObjectId: holdObject.id,
      role: "payer",
      attestationRef: params.attestationRef,
      amount: hold.amount,
      label: params.label,
      subjectId: params.subjectId,
      peerDid: params.peerDid,
    });
    await this.deliverObject(payerConfirmObject, delivery);
    this.recordChannel(params.transactionId, payerConfirmObject);

    const record: TransactionCommitRecord = {
      transactionId: params.transactionId,
      localRole: "payer",
      peerDid: params.peerDid ?? "",
      peerUrl: params.peerUrl,
      phase: "awaiting_payee_confirm",
      amount: hold.amount,
      label: params.label,
      subjectId: params.subjectId,
      holdObjectId: holdObject.id,
      railRef: hold.railRef,
      rail: hold.rail,
      expiresAt: hold.expiresAt,
      payerConfirm: {
        attestationRef: params.attestationRef,
        objectId: payerConfirmObject.id,
        issuerDid: this.deps.localDid,
        at: nowIso(),
      },
      updatedAt: nowIso(),
    };
    this.records.set(params.transactionId, record);
    return record;
  }

  async confirmLocal(params: {
    transactionId: string;
    attestationRef: string;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<TransactionCommitRecord> {
    await this.sweepExpired();
    const record = this.requireRecord(params.transactionId);
    if (record.phase === "captured" || record.phase === "released" || record.phase === "expired") {
      throw new Error(`Transaction ${params.transactionId} is already terminal (${record.phase})`);
    }

    if (params.peerUrl?.trim()) record.peerUrl = params.peerUrl.trim();
    if (params.peerDid?.trim()) record.peerDid = params.peerDid.trim();

    const role = record.localRole;
    const confirmObject = await this.buildConfirmObject({
      transactionId: record.transactionId,
      holdObjectId: record.holdObjectId,
      role,
      attestationRef: params.attestationRef,
      amount: record.amount,
      label: record.label,
      subjectId: record.subjectId,
      peerDid: record.peerDid || undefined,
    });

    const partyConfirm: PartyConfirmRecord = {
      attestationRef: params.attestationRef,
      objectId: confirmObject.id,
      issuerDid: this.deps.localDid,
      at: nowIso(),
    };
    if (role === "payer") {
      record.payerConfirm = partyConfirm;
    } else {
      record.payeeConfirm = partyConfirm;
    }

    const peerUrl = record.peerUrl;
    if (!peerUrl) {
      throw new Error("peerUrl required to send confirm to counterpart");
    }
    await this.deliverObject(confirmObject, {
      peerUrl,
      peerDid: record.peerDid || undefined,
      encrypt: params.encrypt,
    });
    this.recordChannel(record.transactionId, confirmObject);

    if (role === "payee") {
      record.phase = "awaiting_capture";
    } else if (record.payeeConfirm) {
      record.phase = "awaiting_capture";
    }

    record.updatedAt = nowIso();

    if (record.localRole === "payer" && record.payerConfirm && record.payeeConfirm) {
      return this.captureRecord(record, record.payeeConfirm.attestationRef);
    }

    return record;
  }

  async declineLocal(params: {
    transactionId: string;
    attestationRef?: string;
    reason?: ReleaseReason;
    note?: string;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<TransactionCommitRecord> {
    await this.sweepExpired();
    const record = this.requireRecord(params.transactionId);
    if (params.peerUrl?.trim()) record.peerUrl = params.peerUrl.trim();
    if (params.peerDid?.trim()) record.peerDid = params.peerDid.trim();
    return this.releaseRecord(
      record,
      params.reason ?? "declined",
      params.note,
      params.attestationRef,
      params.encrypt,
    );
  }

  async handleInboxObject(object: DataObject): Promise<TransactionCommitRecord | undefined> {
    await this.sweepExpired();
    const purpose = object.governance.purpose;
    const transactionId = String(object.payload.transactionId ?? "");

    if (purpose === "action:hold") {
      this.recordChannel(transactionId, object);
      return this.ingestHold(object);
    }
    if (purpose === "action:confirm") {
      this.recordChannel(transactionId, object);
      return this.ingestConfirm(object);
    }
    if (purpose === "action:capture" || purpose === "action:receipt") {
      this.recordChannel(transactionId, object);
      const record = this.records.get(transactionId);
      if (record) {
        record.phase = "captured";
        record.updatedAt = nowIso();
      }
      return record;
    }
    if (purpose === "action:release") {
      this.recordChannel(transactionId, object);
      const record = this.records.get(transactionId);
      if (
        record &&
        record.localRole === "payer" &&
        record.railRef &&
        record.phase !== "captured" &&
        record.phase !== "released" &&
        record.phase !== "expired"
      ) {
        const rail = this.deps.resolveRail();
        try {
          await rail.releaseHold({
            railRef: record.railRef,
            idempotencyKey: `release-${record.transactionId}`,
          });
        } catch {
          // Hold may already be released or captured on the rail.
        }
      }
      if (record) {
        record.phase = object.payload.reason === "timeout" ? "expired" : "released";
        record.updatedAt = nowIso();
      }
      return record;
    }
    return undefined;
  }

  private async ingestHold(object: DataObject): Promise<TransactionCommitRecord> {
    const { payload } = await verifyActionHold(object);
    const existing = this.records.get(payload.transactionId);
    if (existing) return existing;

    const record: TransactionCommitRecord = {
      transactionId: payload.transactionId,
      localRole: "payee",
      peerDid: object.issuerDid,
      phase: "awaiting_payee_confirm",
      amount: payload.amount,
      label: payload.label,
      subjectId: payload.subjectId,
      holdObjectId: object.id,
      railRef: payload.railRef,
      rail: payload.rail,
      expiresAt: payload.expiresAt,
      updatedAt: nowIso(),
    };
    this.records.set(payload.transactionId, record);
    return record;
  }

  private async ingestConfirm(object: DataObject): Promise<TransactionCommitRecord | undefined> {
    const { payload } = await verifyActionConfirm(object);
    let record = this.records.get(payload.transactionId);
    if (!record) {
      record = {
        transactionId: payload.transactionId,
        localRole: "payer",
        peerDid: object.issuerDid,
        phase: "awaiting_payee_confirm",
        amount: payload.amount,
        label: payload.label,
        subjectId: payload.subjectId,
        holdObjectId: payload.holdObjectId,
        railRef: "",
        rail: "unknown",
        updatedAt: nowIso(),
      };
      this.records.set(payload.transactionId, record);
    }

    const partyConfirm: PartyConfirmRecord = {
      attestationRef: payload.attestationRef,
      objectId: object.id,
      issuerDid: object.issuerDid,
      at: nowIso(),
    };

    if (payload.role === "payer") {
      record.payerConfirm = partyConfirm;
    } else {
      record.payeeConfirm = partyConfirm;
      if (record.localRole === "payer") {
        record.phase = "awaiting_capture";
      }
    }

    record.updatedAt = nowIso();

    if (
      record.localRole === "payer" &&
      record.railRef &&
      record.payerConfirm &&
      record.payeeConfirm
    ) {
      return this.captureRecord(record, record.payeeConfirm.attestationRef);
    }

    return record;
  }

  private async captureRecord(
    record: TransactionCommitRecord,
    captureAttestationRef: string,
  ): Promise<TransactionCommitRecord> {
    if (record.phase === "captured") return record;
    if (record.localRole !== "payer") {
      record.captureAttestationRef = captureAttestationRef;
      record.phase = "awaiting_capture";
      record.updatedAt = nowIso();
      return record;
    }

    const rail = this.deps.resolveRail();
    const captured = await rail.captureHold({
      railRef: record.railRef,
      amount: record.amount,
      idempotencyKey: `capture-${record.transactionId}`,
    });

    const captureObject = await createActionCapture({
      identity: this.deps.identity,
      payload: {
        transactionId: record.transactionId,
        railRef: captured.railRef,
        amount: captured.amount,
        attestationRef: captureAttestationRef,
        peerDid: record.peerDid || undefined,
      },
    });

    const receiptObject = await createActionReceipt({
      identity: this.deps.identity,
      payload: {
        transactionId: record.transactionId,
        railRef: captured.railRef,
        amount: captured.amount,
        attestationRef: captureAttestationRef,
        subjectId: record.subjectId,
        label: record.label,
        peerDid: record.peerDid || undefined,
        capturedAt: captured.capturedAt,
      },
    });

    if (record.peerUrl) {
      await this.deliverObject(captureObject, {
        peerUrl: record.peerUrl,
        peerDid: record.peerDid || undefined,
        encrypt: false,
      });
      this.recordChannel(record.transactionId, captureObject);
      await this.deliverObject(receiptObject, {
        peerUrl: record.peerUrl,
        peerDid: record.peerDid || undefined,
        encrypt: false,
      });
      this.recordChannel(record.transactionId, receiptObject);
    }

    record.phase = "captured";
    record.captureAttestationRef = captureAttestationRef;
    record.updatedAt = nowIso();
    return record;
  }

  private async releaseRecord(
    record: TransactionCommitRecord,
    reason: ReleaseReason,
    note?: string,
    attestationRef?: string,
    encrypt?: boolean,
  ): Promise<TransactionCommitRecord> {
    if (record.phase === "captured" || record.phase === "released" || record.phase === "expired") {
      return record;
    }

    if (record.localRole === "payer" && record.railRef) {
      const rail = this.deps.resolveRail();
      try {
        await rail.releaseHold({
          railRef: record.railRef,
          idempotencyKey: `release-${record.transactionId}`,
        });
      } catch {
        // Hold may already be released or captured on the rail.
      }
    }

    const releaseObject = await createActionRelease({
      identity: this.deps.identity,
      payload: {
        transactionId: record.transactionId,
        railRef: record.railRef,
        reason,
        attestationRef,
        note,
      },
    });

    if (record.peerUrl) {
      await this.deliverObject(releaseObject, {
        peerUrl: record.peerUrl,
        peerDid: record.peerDid || undefined,
        encrypt,
      });
      this.recordChannel(record.transactionId, releaseObject);
    }

    record.phase = reason === "timeout" ? "expired" : "released";
    record.updatedAt = nowIso();
    return record;
  }

  private requireRecord(transactionId: string): TransactionCommitRecord {
    const record = this.records.get(transactionId);
    if (!record) throw new Error(`Unknown transaction: ${transactionId}`);
    return record;
  }

  private async buildConfirmObject(params: {
    transactionId: string;
    holdObjectId: string;
    role: TransactionPartyRole;
    attestationRef: string;
    amount: MonetaryAmount;
    label?: string;
    subjectId?: string;
    peerDid?: string;
  }): Promise<DataObject> {
    return createActionConfirm({
      identity: this.deps.identity,
      payload: {
        transactionId: params.transactionId,
        holdObjectId: params.holdObjectId,
        role: params.role,
        attestationRef: params.attestationRef,
        amount: params.amount,
        label: params.label,
        subjectId: params.subjectId,
        peerDid: params.peerDid,
      },
    });
  }

  private recordChannel(transactionId: string, object: DataObject): void {
    if (!transactionId.trim()) return;
    this.deps.recordChannelObject?.(transactionId, object);
  }

  private async deliverObject(object: DataObject, delivery: PeerDelivery): Promise<void> {
    await deliverSignedObject({
      mlsStore: this.deps.mlsStore,
      peerUrl: delivery.peerUrl,
      peerDid: delivery.peerDid,
      object,
      encrypt: delivery.encrypt ?? false,
    });
  }
}
