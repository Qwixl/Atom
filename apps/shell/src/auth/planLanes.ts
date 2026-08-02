/**
 * Lane IDs + notification UI labels when Atom-MC catalog is unreachable.
 * Do not hardcode Qwixl £ amounts here — fetch via fetchPlanCatalog.ts (D107).
 * Shell owns Never/Hourly/Immediately display names (SIGNUP-PLAN-01 RC-5).
 */

export type BillingLane = "standard" | "byok" | "self_hosted";

export type ReadinessSkuId =
  | "on_when_needed"
  | "keeps_in_touch"
  | "always_ready"
  | "open_for_business";

export type ModelTierId = "efficient" | "balanced" | "maximum";

export interface ReadinessOption {
  id: ReadinessSkuId;
  displayName: string;
  displayPrice: string;
  hint: string;
}

/** Personal/Developer Pay Change ladder — never includes open_for_business. */
export const PERSONAL_DEVELOPER_READINESS_IDS: readonly ReadinessSkuId[] = [
  "on_when_needed",
  "keeps_in_touch",
  "always_ready",
] as const;

export function notificationLabel(skuId: ReadinessSkuId): string {
  switch (skuId) {
    case "on_when_needed":
      return "Never";
    case "keeps_in_touch":
      return "Hourly";
    case "always_ready":
      return "Immediately";
    case "open_for_business":
      return "Open for business";
  }
}

/** Honest reachability helpers — not email/push cadence (SIGNUP-PLAN-01 RC-4). */
export function notificationHint(skuId: ReadinessSkuId): string {
  switch (skuId) {
    case "on_when_needed":
      return "Agent works when you open Atom; inbound work waits until then.";
    case "keeps_in_touch":
      return "Agent checks in about once an hour while you’re away.";
    case "always_ready":
      return "Agent stays ready for messages anytime.";
    case "open_for_business":
      return "Always-on for shoppers and other agents.";
  }
}

export function clampReadinessForAccount(
  accountType: "user" | "developer" | "business",
  readinessSkuId: ReadinessSkuId,
): ReadinessSkuId {
  if (accountType === "business") return "open_for_business";
  if (readinessSkuId === "open_for_business") return "on_when_needed";
  if (!(PERSONAL_DEVELOPER_READINESS_IDS as readonly string[]).includes(readinessSkuId)) {
    return "on_when_needed";
  }
  return readinessSkuId;
}

function readinessOption(id: ReadinessSkuId, displayPrice: string): ReadinessOption {
  return {
    id,
    displayName: notificationLabel(id),
    displayPrice,
    hint: notificationHint(id),
  };
}

/** Fallback names — prices filled from Atom-MC when available (do not invent £ offline). */
export const STANDARD_READINESS: ReadinessOption[] = [
  readinessOption("on_when_needed", "See plan"),
  readinessOption("keeps_in_touch", "See plan"),
  readinessOption("always_ready", "See plan"),
  readinessOption("open_for_business", "See plan"),
];

export const BYOK_READINESS: ReadinessOption[] = [
  readinessOption("on_when_needed", "See plan"),
  readinessOption("keeps_in_touch", "See plan"),
  readinessOption("always_ready", "See plan"),
  readinessOption("open_for_business", "See plan"),
];

/** Pay Change options for Personal/Developer (excludes open_for_business). */
export function payChangeReadinessOptions(
  lane: "standard" | "byok",
  catalogSkus?: Record<string, { id: string; displayPrice: string }>,
): ReadinessOption[] {
  const fallback = lane === "standard" ? STANDARD_READINESS : BYOK_READINESS;
  return PERSONAL_DEVELOPER_READINESS_IDS.map((id) => {
    const price = catalogSkus?.[id]?.displayPrice ?? fallback.find((s) => s.id === id)?.displayPrice ?? "";
    return readinessOption(id, price);
  });
}

export const TOP_UP_OPTIONS_PENCE = [0, 500, 1_000, 2_500] as const;

export const MODEL_TIER_OPTIONS: { id: ModelTierId; label: string; hint: string }[] = [
  { id: "efficient", label: "Efficient", hint: "Best for light everyday use" },
  { id: "balanced", label: "Balanced", hint: "Recommended for most people" },
  { id: "maximum", label: "Maximum", hint: "Highest quality replies" },
];

export function topUpHint(lane: BillingLane): string {
  switch (lane) {
    case "standard":
      return "Skip for now, or add a little credit for extra use.";
    case "byok":
      return "Skip for now, or add credit for speech and shopping extras.";
    case "self_hosted":
      return "Skip for now, or add credit if you’ll shop with other Atom businesses.";
  }
}

export function parseLaneFromSearch(search: string): BillingLane | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lane = params.get("lane");
  if (lane === "standard" || lane === "byok" || lane === "self-hosted" || lane === "self_hosted") {
    return lane === "self-hosted" ? "self_hosted" : lane;
  }
  return null;
}

export function hostingTypeForLane(lane: BillingLane): "hosted" | "self-hosted" {
  return lane === "self_hosted" ? "self-hosted" : "hosted";
}
