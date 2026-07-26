import { describe, expect, it } from "vitest";
import { SubscriptionRequiredError, throwIfBootstrapFailed } from "./hostedAccount.js";

describe("throwIfBootstrapFailed", () => {
  it("throws SubscriptionRequiredError on 402 subscription_required", () => {
    expect(() =>
      throwIfBootstrapFailed(402, {
        error: "subscription_required",
        message: "Complete Stripe Checkout before provisioning your hosted agent.",
        checkout: {
          method: "POST",
          path: "/billing/plans/subscribe",
          body: {
            accountId: "user-1",
            lane: "standard",
            readinessSkuId: "on_when_needed",
          },
        },
      }),
    ).toThrow(SubscriptionRequiredError);

    try {
      throwIfBootstrapFailed(402, {
        error: "subscription_required",
        message: "Pay first",
        checkout: { path: "/billing/plans/subscribe" },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionRequiredError);
      const sub = err as SubscriptionRequiredError;
      expect(sub.message).toBe("Pay first");
      expect(sub.checkout.path).toBe("/billing/plans/subscribe");
    }
  });

  it("throws a normal Error for other failures", () => {
    expect(() => throwIfBootstrapFailed(500, { error: "boom" })).toThrow("boom");
    expect(() => throwIfBootstrapFailed(402, { error: "other" })).toThrow("other");
  });

  it("no-ops on success status", () => {
    expect(() => throwIfBootstrapFailed(200, {})).not.toThrow();
  });
});
