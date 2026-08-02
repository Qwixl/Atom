/**
 * D139 / product law: Atom Business is Atom-hosted Standard only — forever.
 * BYOK and self-host are not Business signup options.
 * SIGNUP-PLAN-01: clamp open_for_business away from Personal/Developer.
 */
import type { AtomAccountType } from "./hostedAccount.js";
import {
  clampReadinessForAccount,
  type BillingLane,
  type ReadinessSkuId,
} from "./planLanes.js";

export const BUSINESS_BILLING_LANE: BillingLane = "standard";
export const BUSINESS_READINESS_SKU: ReadinessSkuId = "open_for_business";

export function isBusinessAccountType(type: AtomAccountType): boolean {
  return type === "business";
}

export { clampReadinessForAccount };

/** Null when OK; otherwise an owner-facing error string. */
export function assertBusinessHosting(input: {
  accountType: AtomAccountType;
  billingLane: BillingLane;
  readinessSkuId?: ReadinessSkuId;
}): string | null {
  if (!isBusinessAccountType(input.accountType)) {
    if (input.readinessSkuId === BUSINESS_READINESS_SKU) {
      return "Open for business is only available on Business accounts.";
    }
    return null;
  }
  if (input.billingLane !== BUSINESS_BILLING_LANE) {
    return "Business accounts use our hosted plan. Continue with Business from Create account.";
  }
  if (input.readinessSkuId && input.readinessSkuId !== BUSINESS_READINESS_SKU) {
    return "Business accounts stay available for customers. Continue to finish setup.";
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
