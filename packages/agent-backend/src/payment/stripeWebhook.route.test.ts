import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createHmac } from "node:crypto";
import { registerStripeModeHWebhook } from "./stripeWebhook.js";

function sign(secret: string, payload: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("registerStripeModeHWebhook", () => {
  it("rejects bad signature and mints on paid session", async () => {
    const onCheckoutPaid = vi.fn(async () => ({ status: "minted" as const }));
    const app = express();
    registerStripeModeHWebhook(app, {
      webhookSecret: "whsec_test",
      onCheckoutPaid,
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const bad = await fetch(`${base}/billing/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=deadbeef",
        },
        body: "{}",
      });
      expect(bad.status).toBe(400);

      const payload = JSON.stringify({
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_1",
            object: "checkout.session",
            payment_status: "paid",
            amount_total: 8900,
            currency: "eur",
            metadata: { offerId: "offer-1", intentId: "intent-1" },
          },
        },
      });
      const t = Math.floor(Date.now() / 1000);
      const ok = await fetch(`${base}/billing/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": sign("whsec_test", payload, t),
        },
        body: payload,
      });
      expect(ok.status).toBe(200);
      expect(onCheckoutPaid).toHaveBeenCalledOnce();
    } finally {
      server.close();
    }
  });
});
