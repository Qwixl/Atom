import { describe, expect, it } from "vitest";
import express from "express";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { registerTransactionAdminRoutes } from "./transactionAdmin.js";
import type { TransactionCommitStore } from "./transactionCommitStore.js";

describe("transactionAdmin Mode H hold rejection", () => {
  it("returns 409 for merchant-checkout settlementMode", async () => {
    const app = express();
    app.use(express.json());
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          throw new Error("must not placeHold");
        },
      } as unknown as TransactionCommitStore,
    });

    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const res = await fetch(`${base}/transactions/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: "txn-1",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          settlementMode: "merchant-checkout",
          subjectId: "offer-intent-item",
        }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/Mode H commerce/);
    } finally {
      server.close();
    }
  });

  it("returns 409 for offer-* subjectId", async () => {
    const app = express();
    app.use(express.json());
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          throw new Error("must not placeHold");
        },
      } as unknown as TransactionCommitStore,
    });

    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const res = await fetch(`${base}/transactions/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: "txn-2",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          subjectId: "offer-xyz",
        }),
      });
      expect(res.status).toBe(409);
    } finally {
      server.close();
    }
  });
});
