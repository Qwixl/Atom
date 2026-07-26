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
    displayName: "On when you need it",
    displayPrice: "hosted",
    hint: "Hosted agent with included credits (pricing from host)",
  },
  {
    id: "keeps_in_touch",
    displayName: "Keeps in touch",
    displayPrice: "hosted",
    hint: "Checks in hourly when you’re away",
  },
  {
    id: "always_ready",
    displayName: "Always ready",
    displayPrice: "hosted",
    hint: "Always on for messages and brain tasks",
  },
  {
    id: "open_for_business",
    displayName: "Open for business",
    displayPrice: "hosted",
    hint: "Always on with business storefront ops",
  },
];

export const BYOK_READINESS: ReadinessOption[] = [
  {
    id: "on_when_needed",
    displayName: "On when you need it",
    displayPrice: "hosted",
    hint: "Hosting — you bring your LLM key",
  },
  {
    id: "keeps_in_touch",
    displayName: "Keeps in touch",
    displayPrice: "hosted",
    hint: "Hourly wake — your key",
  },
  {
    id: "always_ready",
    displayName: "Always ready",
    displayPrice: "hosted",
    hint: "Always-on hosting — your key",
  },
  {
    id: "open_for_business",
    displayName: "Open for business",
    displayPrice: "hosted",
    hint: "Business hosting — your key",
  },
];

export const TOP_UP_OPTIONS_PENCE = [0, 500, 1_000, 2_500] as const;

export const MODEL_TIER_OPTIONS: { id: ModelTierId; label: string; hint: string }[] = [
  { id: "efficient", label: "Efficient", hint: "Lighter use, lower credit burn" },
  { id: "balanced", label: "Balanced", hint: "Default — strong everyday agent" },
  { id: "maximum", label: "Maximum", hint: "Highest quality step-up" },
];

export function topUpHint(lane: BillingLane): string {
  switch (lane) {
    case "standard":
      return "Credits cover agent chat, speech, and Agent Spend at Atom businesses.";
    case "byok":
      return "Top-ups cover Agent speech and Agent Spend (your LLM key covers chat).";
    case "self_hosted":
      return "Optional top-ups cover Agent Spend with Atom businesses.";
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
