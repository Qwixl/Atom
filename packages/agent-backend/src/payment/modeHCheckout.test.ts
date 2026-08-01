import { describe, expect, it, vi } from "vitest";
import { createModeHCheckoutSession } from "./modeHCheckout.js";

describe("createModeHCheckoutSession", () => {
  it("posts Checkout Session with Stripe-Account header and no application fee", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "Stripe-Account": "acct_test_merchant",
      });
      const body = String(init?.body ?? "");
      expect(body).toContain("mode=payment");
      expect(body).toContain("metadata%5BofferId%5D=offer-1");
      expect(body).not.toContain("application_fee");
      return new Response(
        JSON.stringify({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200 },
      );
    });

    const result = await createModeHCheckoutSession({
      secretKey: "sk_test_x",
      stripeAccountId: "acct_test_merchant",
      offerId: "offer-1",
      intentId: "intent-1",
      label: "Widget",
      amountMinor: 1200,
      currency: "EUR",
      successUrl: "https://atom.qwixl.com/app/?commerce=success",
      cancelUrl: "https://atom.qwixl.com/app/?commerce=cancel",
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.sessionId).toBe("cs_test_1");
    expect(result.url).toContain("https://");
  });
});
