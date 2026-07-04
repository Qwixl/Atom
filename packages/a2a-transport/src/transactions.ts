import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  ACTION_CAPTURE_PURPOSE,
  ACTION_CAPTURE_SCHEMA,
  ACTION_CONFIRM_PURPOSE,
  ACTION_CONFIRM_SCHEMA,
  ACTION_HOLD_PURPOSE,
  ACTION_HOLD_SCHEMA,
  ACTION_RECEIPT_PURPOSE,
  ACTION_RECEIPT_SCHEMA,
  ACTION_RELEASE_PURPOSE,
  ACTION_RELEASE_SCHEMA,
  DEFAULT_ACTION_HOLD_TTL_SECONDS,
  TRANSACTION_PURPOSES,
} from "./constants.js";

/**
 * M11 transaction-flow objects (docs/03-protocol/06-commerce-m11.md).
 * Ring-fence = authorization hold on an existing payment rail; capture only
 * after mutual shell-chrome confirm; release is the SAGA compensating action.
 */

export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];

export type ReleaseReason = "declined" | "timeout" | "failure" | "cancelled";

export type TransactionPartyRole = "payer" | "payee";

export interface ActionConfirmPayload {
  transactionId: string;
  /** action:hold object id this confirm attests to. */
  holdObjectId: string;
  role: TransactionPartyRole;
  attestationRef: string;
  amount: MonetaryAmount;
  subjectId?: string;
  label?: string;
  peerDid?: string;
}

/** ISO 4217 currency code + minor units (cents). Never floats. */
export interface MonetaryAmount {
  currency: string;
  amountMinor: number;
}

export interface ActionHoldPayload {
  /** Unique id for this transaction across all four objects. */
  transactionId: string;
  /** Payment-rail hold reference (e.g. Stripe PaymentIntent id). */
  railRef: string;
  /** Rail identifier, e.g. "stripe". */
  rail: string;
  amount: MonetaryAmount;
  /** Link to shell attestation entry for the owner's confirm of the hold. */
  attestationRef: string;
  /** What is being purchased, from signed offer fields — not free text. */
  subjectId?: string;
  label?: string;
  peerDid?: string;
  /** Hold expiry (ISO); rail-side auth window. */
  expiresAt?: string;
}

export interface ActionCapturePayload {
  transactionId: string;
  railRef: string;
  amount: MonetaryAmount;
  /** Attestation of the final confirm that authorized capture. */
  attestationRef: string;
  peerDid?: string;
}

export interface ActionReleasePayload {
  transactionId: string;
  railRef: string;
  reason: ReleaseReason;
  attestationRef?: string;
  note?: string;
}

export interface ActionReceiptPayload {
  transactionId: string;
  railRef: string;
  amount: MonetaryAmount;
  /** Capture attestation carried into the durable receipt. */
  attestationRef: string;
  subjectId?: string;
  label?: string;
  peerDid?: string;
  capturedAt: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Transaction payload field "${field}" must be a non-empty string`);
  }
}

function assertAmount(value: unknown): asserts value is MonetaryAmount {
  if (typeof value !== "object" || value === null) {
    throw new Error("Transaction amount must be an object");
  }
  const amount = value as Partial<MonetaryAmount>;
  if (typeof amount.currency !== "string" || !/^[A-Z]{3}$/.test(amount.currency)) {
    throw new Error("Transaction amount.currency must be an ISO 4217 code");
  }
  if (
    typeof amount.amountMinor !== "number" ||
    !Number.isInteger(amount.amountMinor) ||
    amount.amountMinor <= 0
  ) {
    throw new Error("Transaction amount.amountMinor must be a positive integer");
  }
}

function assertReleaseReason(value: unknown): asserts value is ReleaseReason {
  if (value !== "declined" && value !== "timeout" && value !== "failure" && value !== "cancelled") {
    throw new Error("Transaction release reason is invalid");
  }
}

function assertTransactionPartyRole(value: unknown): asserts value is TransactionPartyRole {
  if (value !== "payer" && value !== "payee") {
    throw new Error("Transaction confirm role is invalid");
  }
}

async function signTransactionObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: TransactionPurpose;
    payload: Record<string, unknown>;
    ttlSeconds?: number;
  },
): Promise<DataObject> {
  return signDataObject(
    {
      semantic: { schema: opts.schema },
      payload: opts.payload,
      governance: {
        purpose: opts.purpose,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_ACTION_HOLD_TTL_SECONDS,
      },
    },
    identity,
  );
}

async function verifyTransactionObject(
  input: unknown,
  expected: { purpose: TransactionPurpose; schema: string },
): Promise<DataObject> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...TRANSACTION_PURPOSES],
  });
  if (object.governance.purpose !== expected.purpose) {
    throw new Error(`Expected purpose ${expected.purpose}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== expected.schema) {
    throw new Error(`Expected schema ${expected.schema}, got ${object.semantic.schema}`);
  }
  return object;
}

export async function createActionHold(opts: {
  identity: AgentKeyPair;
  payload: ActionHoldPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.transactionId, "transactionId");
  assertNonEmptyString(opts.payload.railRef, "railRef");
  assertNonEmptyString(opts.payload.rail, "rail");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertAmount(opts.payload.amount);
  return signTransactionObject(opts.identity, {
    schema: ACTION_HOLD_SCHEMA,
    purpose: ACTION_HOLD_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionHold(input: unknown): Promise<{
  object: DataObject;
  payload: ActionHoldPayload;
}> {
  const object = await verifyTransactionObject(input, {
    purpose: ACTION_HOLD_PURPOSE,
    schema: ACTION_HOLD_SCHEMA,
  });
  assertNonEmptyString(object.payload.transactionId, "transactionId");
  assertNonEmptyString(object.payload.railRef, "railRef");
  assertNonEmptyString(object.payload.rail, "rail");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertAmount(object.payload.amount);
  return { object, payload: object.payload as unknown as ActionHoldPayload };
}

export async function createActionConfirm(opts: {
  identity: AgentKeyPair;
  payload: ActionConfirmPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.transactionId, "transactionId");
  assertNonEmptyString(opts.payload.holdObjectId, "holdObjectId");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertTransactionPartyRole(opts.payload.role);
  assertAmount(opts.payload.amount);
  return signTransactionObject(opts.identity, {
    schema: ACTION_CONFIRM_SCHEMA,
    purpose: ACTION_CONFIRM_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionConfirm(input: unknown): Promise<{
  object: DataObject;
  payload: ActionConfirmPayload;
}> {
  const object = await verifyTransactionObject(input, {
    purpose: ACTION_CONFIRM_PURPOSE,
    schema: ACTION_CONFIRM_SCHEMA,
  });
  assertNonEmptyString(object.payload.transactionId, "transactionId");
  assertNonEmptyString(object.payload.holdObjectId, "holdObjectId");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertTransactionPartyRole(object.payload.role);
  assertAmount(object.payload.amount);
  return { object, payload: object.payload as unknown as ActionConfirmPayload };
}

export async function createActionCapture(opts: {
  identity: AgentKeyPair;
  payload: ActionCapturePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.transactionId, "transactionId");
  assertNonEmptyString(opts.payload.railRef, "railRef");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertAmount(opts.payload.amount);
  return signTransactionObject(opts.identity, {
    schema: ACTION_CAPTURE_SCHEMA,
    purpose: ACTION_CAPTURE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionCapture(input: unknown): Promise<{
  object: DataObject;
  payload: ActionCapturePayload;
}> {
  const object = await verifyTransactionObject(input, {
    purpose: ACTION_CAPTURE_PURPOSE,
    schema: ACTION_CAPTURE_SCHEMA,
  });
  assertNonEmptyString(object.payload.transactionId, "transactionId");
  assertNonEmptyString(object.payload.railRef, "railRef");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertAmount(object.payload.amount);
  return { object, payload: object.payload as unknown as ActionCapturePayload };
}

export async function createActionRelease(opts: {
  identity: AgentKeyPair;
  payload: ActionReleasePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.transactionId, "transactionId");
  assertNonEmptyString(opts.payload.railRef, "railRef");
  assertReleaseReason(opts.payload.reason);
  return signTransactionObject(opts.identity, {
    schema: ACTION_RELEASE_SCHEMA,
    purpose: ACTION_RELEASE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionRelease(input: unknown): Promise<{
  object: DataObject;
  payload: ActionReleasePayload;
}> {
  const object = await verifyTransactionObject(input, {
    purpose: ACTION_RELEASE_PURPOSE,
    schema: ACTION_RELEASE_SCHEMA,
  });
  assertNonEmptyString(object.payload.transactionId, "transactionId");
  assertNonEmptyString(object.payload.railRef, "railRef");
  assertReleaseReason(object.payload.reason);
  return { object, payload: object.payload as unknown as ActionReleasePayload };
}

export async function createActionReceipt(opts: {
  identity: AgentKeyPair;
  payload: ActionReceiptPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.transactionId, "transactionId");
  assertNonEmptyString(opts.payload.railRef, "railRef");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertNonEmptyString(opts.payload.capturedAt, "capturedAt");
  assertAmount(opts.payload.amount);
  return signTransactionObject(opts.identity, {
    schema: ACTION_RECEIPT_SCHEMA,
    purpose: ACTION_RECEIPT_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionReceipt(input: unknown): Promise<{
  object: DataObject;
  payload: ActionReceiptPayload;
}> {
  const object = await verifyTransactionObject(input, {
    purpose: ACTION_RECEIPT_PURPOSE,
    schema: ACTION_RECEIPT_SCHEMA,
  });
  assertNonEmptyString(object.payload.transactionId, "transactionId");
  assertNonEmptyString(object.payload.railRef, "railRef");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertNonEmptyString(object.payload.capturedAt, "capturedAt");
  assertAmount(object.payload.amount);
  return { object, payload: object.payload as unknown as ActionReceiptPayload };
}
