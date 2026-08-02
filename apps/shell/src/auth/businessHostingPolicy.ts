/**
 * D139 / product law: Atom Business is Atom-hosted Standard only — forever.
 * BYOK and self-host are not Business signup options.
 */
import type { AtomAccountType } from "./hostedAccount.js";
import type { BillingLane, ReadinessSkuId } from "./planLanes.js";

export const BUSINESS_BILLING_LANE: BillingLane = "standard";
export const BUSINESS_READINESS_SKU: ReadinessSkuId = "open_for_business";

export function isBusinessAccountType(type: AtomAccountType): boolean {
  return type === "business";
}

/** Null when OK; otherwise an owner-facing error string. */
export function assertBusinessHosting(input: {
  accountType: AtomAccountType;
  billingLane: BillingLane;
  readinessSkuId?: ReadinessSkuId;
}): string | null {
  if (!isBusinessAccountType(input.accountType)) return null;
  if (input.billingLane !== BUSINESS_BILLING_LANE) {
    return "Atom Business is Atom-hosted Standard only. BYOK and self-host are not available.";
  }
  if (input.readinessSkuId && input.readinessSkuId !== BUSINESS_READINESS_SKU) {
    return "Atom Business requires Open for business (Always-On) readiness.";
  }
  return null;
}

export function businessHostingDefaults(): {
  billingLane: typeof BUSINESS_BILLING_LANE;
  readinessSkuId: typeof BUSINESS_READINESS_SKU;
  hosting: "hosted";
} {
  return {
    billingLane: BUSINESS_BILLING_LANE,
    readinessSkuId: BUSINESS_READINESS_SKU,
    hosting: "hosted",
  };
}
