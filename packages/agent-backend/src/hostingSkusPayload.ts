import { HOSTING_SKUS, alwaysOnBrainPricePayload } from "./alwaysOnPricing.js";

/**
 * Reachability entitlement labels for Settings.
 * Customer packaging / GBP ladders: Atom-MC `GET /billing/plans`.
 */
export function hostingSkusPayload() {
  return {
    currency: "gbp" as const,
    listingFeeAtLaunch: 0,
    skus: {
      sleep: { ...HOSTING_SKUS.sleep, reachability: "sleep" as const },
      hourly_wake: { ...HOSTING_SKUS.hourly_wake, reachability: "hourly_wake" as const },
      always_on: { ...HOSTING_SKUS.always_on, reachability: "always_on" as const },
      business: { ...HOSTING_SKUS.business, reachability: "always_on" as const },
    },
    catalogSource: "atom-mc" as const,
    ...alwaysOnBrainPricePayload(),
  };
}
