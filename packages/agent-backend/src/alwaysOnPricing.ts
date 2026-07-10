/** Published always-on Agent Brain pricing (Q13 / D078). Amounts in minor units. */

export const ALWAYS_ON_BRAIN_PRICE = {
  /** USD cents per month — published before beta exit (D028 no-rug-pull). */
  unitAmountCents: 1_200,
  currency: "usd",
  interval: "month" as const,
  /** Human label for Settings / Checkout product name. */
  productName: "Atom Always-on Agent Brain",
  /** Short copy for billing status. */
  displayPrice: "$12/month",
};

export function alwaysOnBrainPricePayload() {
  return {
    alwaysOnBrainPriceCents: ALWAYS_ON_BRAIN_PRICE.unitAmountCents,
    alwaysOnBrainCurrency: ALWAYS_ON_BRAIN_PRICE.currency,
    alwaysOnBrainInterval: ALWAYS_ON_BRAIN_PRICE.interval,
    alwaysOnBrainDisplayPrice: ALWAYS_ON_BRAIN_PRICE.displayPrice,
  };
}
