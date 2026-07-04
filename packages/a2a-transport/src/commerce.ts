import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  COMMERCE_DECLINE_PURPOSE,
  COMMERCE_DECLINE_SCHEMA,
  COMMERCE_INTENT_PURPOSE,
  COMMERCE_INTENT_SCHEMA,
  COMMERCE_OFFER_PURPOSE,
  COMMERCE_OFFER_SCHEMA,
  COMMERCE_PURPOSES,
  DEFAULT_COMMERCE_TTL_SECONDS,
} from "./constants.js";
import type { MonetaryAmount } from "./transactions.js";

/**
 * M12 commerce objects — intent / offer / decline (D031: rankable terms in signed fields).
 */

export type CommercePurpose = (typeof COMMERCE_PURPOSES)[number];

export interface CommerceIntentConstraints {
  maxAmountMinor?: number;
  currency?: string;
}

export interface CommerceIntentPayload {
  /** Unique id for this intent (referenced by offer/decline). */
  intentId: string;
  /** Known catalog item id, if the buyer already selected one. */
  catalogItemId?: string;
  /** Human-readable query — counterpart must quarantine before model use (D031). */
  query?: string;
  constraints?: CommerceIntentConstraints;
  /** Optional link to a prior action:qualify object. */
  qualifyObjectId?: string;
  /** Buyer agent admin base URL for async offer/decline delivery. */
  replyUrl?: string;
  threadId?: string;
  peerDid?: string;
}

export interface CommerceOfferPayload {
  offerId: string;
  intentId: string;
  catalogItemId: string;
  /** Rankable display label (signed field). */
  label: string;
  amount: MonetaryAmount;
  /** Rankable availability flag. */
  available: boolean;
  /** Rankable terms lines (refund policy, delivery window, etc.). */
  terms: string[];
  /** D028 disclosed sponsorship — rankable only when true + disclosed. */
  sponsored?: boolean;
  sponsoredRank?: number;
  validUntil?: string;
  peerDid?: string;
}

export interface CommerceDeclinePayload {
  intentId: string;
  reasonCode: "no-match" | "unavailable" | "policy" | "other";
  note?: string;
  peerDid?: string;
}

function assertMonetaryAmount(value: unknown): asserts value is MonetaryAmount {
  if (typeof value !== "object" || value === null) {
    throw new Error("Commerce amount must be an object");
  }
  const amount = value as Partial<MonetaryAmount>;
  if (typeof amount.currency !== "string" || !/^[A-Z]{3}$/.test(amount.currency)) {
    throw new Error("Commerce amount.currency must be an ISO 4217 code");
  }
  if (
    typeof amount.amountMinor !== "number" ||
    !Number.isInteger(amount.amountMinor) ||
    amount.amountMinor <= 0
  ) {
    throw new Error("Commerce amount.amountMinor must be a positive integer");
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Commerce payload field "${field}" must be a non-empty string`);
  }
}

function assertDeclineReason(value: unknown): asserts value is CommerceDeclinePayload["reasonCode"] {
  if (value !== "no-match" && value !== "unavailable" && value !== "policy" && value !== "other") {
    throw new Error("Commerce decline reasonCode is invalid");
  }
}

function assertTerms(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error("Commerce offer terms must be an array");
  }
  for (const term of value) {
    if (typeof term !== "string") {
      throw new Error("Commerce offer terms must be strings");
    }
  }
}

async function signCommerceObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: CommercePurpose;
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
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_COMMERCE_TTL_SECONDS,
      },
    },
    identity,
  );
}

async function verifyCommerceObject(
  input: unknown,
  expected: { purpose: CommercePurpose; schema: string },
): Promise<DataObject> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...COMMERCE_PURPOSES],
  });
  if (object.governance.purpose !== expected.purpose) {
    throw new Error(`Expected purpose ${expected.purpose}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== expected.schema) {
    throw new Error(`Expected schema ${expected.schema}, got ${object.semantic.schema}`);
  }
  return object;
}

export async function createCommerceIntent(opts: {
  identity: AgentKeyPair;
  payload: CommerceIntentPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.intentId, "intentId");
  if (!opts.payload.catalogItemId?.trim() && !opts.payload.query?.trim()) {
    throw new Error("Commerce intent requires catalogItemId or query");
  }
  return signCommerceObject(opts.identity, {
    schema: COMMERCE_INTENT_SCHEMA,
    purpose: COMMERCE_INTENT_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyCommerceIntent(input: unknown): Promise<{
  object: DataObject;
  payload: CommerceIntentPayload;
}> {
  const object = await verifyCommerceObject(input, {
    purpose: COMMERCE_INTENT_PURPOSE,
    schema: COMMERCE_INTENT_SCHEMA,
  });
  assertNonEmptyString(object.payload.intentId, "intentId");
  return { object, payload: object.payload as unknown as CommerceIntentPayload };
}

export async function createCommerceOffer(opts: {
  identity: AgentKeyPair;
  payload: CommerceOfferPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.offerId, "offerId");
  assertNonEmptyString(opts.payload.intentId, "intentId");
  assertNonEmptyString(opts.payload.catalogItemId, "catalogItemId");
  assertNonEmptyString(opts.payload.label, "label");
  assertMonetaryAmount(opts.payload.amount);
  assertTerms(opts.payload.terms);
  if (typeof opts.payload.available !== "boolean") {
    throw new Error("Commerce offer available must be a boolean");
  }
  return signCommerceObject(opts.identity, {
    schema: COMMERCE_OFFER_SCHEMA,
    purpose: COMMERCE_OFFER_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyCommerceOffer(input: unknown): Promise<{
  object: DataObject;
  payload: CommerceOfferPayload;
}> {
  const object = await verifyCommerceObject(input, {
    purpose: COMMERCE_OFFER_PURPOSE,
    schema: COMMERCE_OFFER_SCHEMA,
  });
  assertNonEmptyString(object.payload.offerId, "offerId");
  assertNonEmptyString(object.payload.intentId, "intentId");
  assertNonEmptyString(object.payload.catalogItemId, "catalogItemId");
  assertNonEmptyString(object.payload.label, "label");
  assertMonetaryAmount(object.payload.amount);
  assertTerms(object.payload.terms);
  return { object, payload: object.payload as unknown as CommerceOfferPayload };
}

export async function createCommerceDecline(opts: {
  identity: AgentKeyPair;
  payload: CommerceDeclinePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.intentId, "intentId");
  assertDeclineReason(opts.payload.reasonCode);
  return signCommerceObject(opts.identity, {
    schema: COMMERCE_DECLINE_SCHEMA,
    purpose: COMMERCE_DECLINE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyCommerceDecline(input: unknown): Promise<{
  object: DataObject;
  payload: CommerceDeclinePayload;
}> {
  const object = await verifyCommerceObject(input, {
    purpose: COMMERCE_DECLINE_PURPOSE,
    schema: COMMERCE_DECLINE_SCHEMA,
  });
  assertNonEmptyString(object.payload.intentId, "intentId");
  assertDeclineReason(object.payload.reasonCode);
  return { object, payload: object.payload as unknown as CommerceDeclinePayload };
}
