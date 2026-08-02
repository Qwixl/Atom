/**
 * Lane IDs + fallback labels when Atom-MC catalog is unreachable.
 * Do not hardcode Qwixl £ amounts here — fetch via fetchPlanCatalog.ts (D107).
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

/** Fallback names only — prices filled from Atom-MC when available. */
export const STANDARD_READINESS: ReadinessOption[] = [
  {
    id: "on_when_needed",
    displayName: "When you open it",
    displayPrice: "included",
    hint: "Starts when you use Atom",
  },
  {
    id: "keeps_in_touch",
    displayName: "Checks in hourly",
    displayPrice: "included",
    hint: "Looks for updates about once an hour while you’re away",
  },
  {
    id: "always_ready",
    displayName: "Always available",
    displayPrice: "included",
    hint: "Stays ready for messages anytime",
  },
  {
    id: "open_for_business",
    displayName: "Open for customers",
    displayPrice: "included",
    hint: "Stays ready for shoppers and messages",
  },
];

export const BYOK_READINESS: ReadinessOption[] = [
  {
    id: "on_when_needed",
    displayName: "When you open it",
    displayPrice: "included",
    hint: "Starts when you use Atom — with your AI key",
  },
  {
    id: "keeps_in_touch",
    displayName: "Checks in hourly",
    displayPrice: "included",
    hint: "Looks for updates about once an hour — with your AI key",
  },
  {
    id: "always_ready",
    displayName: "Always available",
    displayPrice: "included",
    hint: "Stays ready for messages — with your AI key",
  },
  {
    id: "open_for_business",
    displayName: "Open for customers",
    displayPrice: "included",
    hint: "Stays ready for shoppers — with your AI key",
  },
];

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
