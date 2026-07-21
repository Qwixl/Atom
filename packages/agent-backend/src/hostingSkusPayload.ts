import { HOSTING_SKUS, alwaysOnBrainPricePayload } from "./alwaysOnPricing.js";

/** Catalog for Settings / Checkout (D094). Beta: charges waived. */
export function hostingSkusPayload() {
  return {
    currency: "gbp" as const,
    betaChargesWaived: true,
    listingFeeAtLaunch: 0,
    earlyAdopterDiscountPending: true,
    skus: {
      sleep: { ...HOSTING_SKUS.sleep, reachability: "sleep" as const },
      hourly_wake: { ...HOSTING_SKUS.hourly_wake, reachability: "hourly_wake" as const },
      always_on: { ...HOSTING_SKUS.always_on, reachability: "always_on" as const },
      business: { ...HOSTING_SKUS.business, reachability: "always_on" as const },
    },
    ...alwaysOnBrainPricePayload(),
  };
}
