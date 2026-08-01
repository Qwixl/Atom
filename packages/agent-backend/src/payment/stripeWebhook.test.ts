import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkoutSessionIsPaid,
  paymentIntentIdFromSession,
  verifyStripeWebhookSignature,
} from "./stripeWebhook.js";

function signPayload(secret: string, payload: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`;
  const v1 = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

describe("stripeWebhook helpers", () => {
  it("verifies a valid Stripe-Signature", () => {
    const secret = "whsec_test";
    const body = Buffer.from('{"id":"evt_1"}', "utf8");
    const t = Math.floor(Date.now() / 1000);
    const header = signPayload(secret, body.toString("utf8"), t);
    expect(verifyStripeWebhookSignature(body, header, secret, 300, t)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const secret = "whsec_test";
    const body = Buffer.from('{"id":"evt_1"}', "utf8");
    const t = Math.floor(Date.now() / 1000);
    const header = signPayload(secret, body.toString("utf8"), t);
    expect(
      verifyStripeWebhookSignature(Buffer.from('{"id":"evt_2"}', "utf8"), header, secret, 300, t),
    ).toBe(false);
  });

  it("requires payment_status paid", () => {
    expect(checkoutSessionIsPaid({ id: "cs_1", payment_status: "unpaid" })).toBe(false);
    expect(checkoutSessionIsPaid({ id: "cs_1", payment_status: "paid" })).toBe(true);
  });

  it("extracts payment_intent id", () => {
    expect(paymentIntentIdFromSession({ id: "cs_1", payment_intent: "pi_abc" })).toBe("pi_abc");
    expect(paymentIntentIdFromSession({ id: "cs_1", payment_intent: { id: "pi_x" } })).toBe("pi_x");
  });
});
