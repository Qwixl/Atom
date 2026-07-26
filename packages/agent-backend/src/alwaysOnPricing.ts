/**
 * Reachability entitlement labels for self-host / generic operators.
 * Qwixl GBP plan ladders live in private Atom-MC (D107) — not hardcoded here.
 */

/** Optional Checkout amount when an operator sets ATOM_ALWAYS_ON_PRICE_PENCE. */
function alwaysOnPricePenceFromEnv(): number | null {
  const raw = process.env.ATOM_ALWAYS_ON_PRICE_PENCE?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export const ALWAYS_ON_BRAIN_PRICE = {
  get unitAmountPence(): number {
    return alwaysOnPricePenceFromEnv() ?? 0;
  },
  /** @deprecated use unitAmountPence */
  get unitAmountCents(): number {
    return alwaysOnPricePenceFromEnv() ?? 0;
  },
  currency: "gbp" as const,
  interval: "month" as const,
  productName: "Always-on agent reachability",
  get displayPrice(): string {
    const p = alwaysOnPricePenceFromEnv();
    return p ? `£${(p / 100).toFixed(0)}/month` : "operator-configured";
  },
};

/** Reachability SKU ids only — no published Qwixl prices. */
export const HOSTING_SKUS = {
  sleep: {
    id: "sleep" as const,
    currency: "gbp" as const,
    productName: "Managed agent (sleep)",
  },
  hourly_wake: {
    id: "hourly_wake" as const,
    currency: "gbp" as const,
    productName: "Managed agent (hourly wake)",
  },
  always_on: {
    id: "always_on" as const,
    currency: "gbp" as const,
    productName: ALWAYS_ON_BRAIN_PRICE.productName,
  },
  business: {
    id: "business" as const,
    currency: "gbp" as const,
    productName: "Managed business agent",
  },
} as const;

export function alwaysOnBrainPricePayload() {
  const pence = ALWAYS_ON_BRAIN_PRICE.unitAmountPence;
  return {
    alwaysOnBrainPriceCents: pence || null,
    alwaysOnBrainPricePence: pence || null,
    alwaysOnBrainCurrency: ALWAYS_ON_BRAIN_PRICE.currency,
    alwaysOnBrainInterval: ALWAYS_ON_BRAIN_PRICE.interval,
    alwaysOnBrainDisplayPrice: ALWAYS_ON_BRAIN_PRICE.displayPrice,
    /** Full Qwixl catalog: Atom-MC GET /billing/plans */
    plansCatalog: "atom-mc" as const,
  };
}
