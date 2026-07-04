import { describe, expect, it, vi } from "vitest";
import { StripePaymentRail } from "./stripeRail.js";

const SECRET = "sk_test_example";

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = Object.entries(handlers).find(([pattern]) => url.includes(pattern))?.[1];
    if (!handler) {
      return new Response(JSON.stringify({ error: { message: `unexpected url ${url}` } }), {
        status: 404,
      });
    }
    const body = handler(init);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("StripePaymentRail", () => {
  it("places a manual-capture hold", async () => {
    const fetchImpl = mockFetch({
      "/payment_intents": () => ({
        id: "pi_123",
        status: "requires_capture",
        amount: 22000,
        currency: "eur",
        client_secret: "pi_123_secret",
      }),
    });
    const rail = new StripePaymentRail({ secretKey: SECRET, fetchImpl });
    const hold = await rail.placeHold({
      transactionId: "txn-1",
      amount: { currency: "EUR", amountMinor: 22000 },
      paymentMethodId: "pm_abc",
    });
    expect(hold.railRef).toBe("pi_123");
    expect(hold.status).toBe("requires_capture");
    expect(hold.amount.amountMinor).toBe(22000);
  });

  it("captures a held intent", async () => {
    const fetchImpl = mockFetch({
      "/capture": () => ({
        id: "pi_123",
        status: "succeeded",
        amount: 22000,
        currency: "eur",
      }),
    });
    const rail = new StripePaymentRail({ secretKey: SECRET, fetchImpl });
    const captured = await rail.captureHold({ railRef: "pi_123" });
    expect(captured.status).toBe("succeeded");
    expect(captured.amount.currency).toBe("EUR");
  });

  it("releases (cancels) a held intent", async () => {
    const fetchImpl = mockFetch({
      "/cancel": () => ({
        id: "pi_123",
        status: "canceled",
        canceled_at: Math.floor(Date.now() / 1000),
      }),
    });
    const rail = new StripePaymentRail({ secretKey: SECRET, fetchImpl });
    const released = await rail.releaseHold({ railRef: "pi_123" });
    expect(released.status).toBe("canceled");
  });
});
