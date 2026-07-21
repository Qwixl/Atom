/** Published managed-agent hosting SKUs (Q13 / D078 / D096). Amounts in minor units (pence). */

export const HOSTING_SKUS = {
  sleep: {
    unitAmountPence: 500,
    currency: "gbp",
    displayPrice: "£5/month",
    productName: "Atom Managed Agent (Sleep)",
  },
  hourly_wake: {
    unitAmountPence: 1_000,
    currency: "gbp",
    displayPrice: "£10/month",
    productName: "Atom Managed Agent (Hourly wake)",
  },
  always_on: {
    unitAmountPence: 2_000,
    currency: "gbp",
    displayPrice: "£20/month",
    productName: "Atom Always-on Agent",
  },
  business: {
    unitAmountPence: 5_000,
    currency: "gbp",
    displayPrice: "£50/month",
    productName: "Atom Managed Business Agent",
  },
} as const;

/** Backward-compatible alias for always-on brain checkout (D078). */
export const ALWAYS_ON_BRAIN_PRICE = {
  unitAmountPence: HOSTING_SKUS.always_on.unitAmountPence,
  /** @deprecated use unitAmountPence — kept for legacy callers expecting "cents" field name. */
  unitAmountCents: HOSTING_SKUS.always_on.unitAmountPence,
  currency: HOSTING_SKUS.always_on.currency,
  interval: "month" as const,
  productName: HOSTING_SKUS.always_on.productName,
  displayPrice: HOSTING_SKUS.always_on.displayPrice,
};

export function alwaysOnBrainPricePayload() {
  return {
    alwaysOnBrainPriceCents: ALWAYS_ON_BRAIN_PRICE.unitAmountPence,
    alwaysOnBrainPricePence: ALWAYS_ON_BRAIN_PRICE.unitAmountPence,
    alwaysOnBrainCurrency: ALWAYS_ON_BRAIN_PRICE.currency,
    alwaysOnBrainInterval: ALWAYS_ON_BRAIN_PRICE.interval,
    alwaysOnBrainDisplayPrice: ALWAYS_ON_BRAIN_PRICE.displayPrice,
  };
}
