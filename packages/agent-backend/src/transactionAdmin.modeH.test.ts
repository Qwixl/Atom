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

  it("BUS-01-HOLD-GATE: rejects subjectId matching pending Mode H offer without offer- prefix", async () => {
    const app = express();
    app.use(express.json());
    let placeHoldCalled = false;
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          placeHoldCalled = true;
          throw new Error("must not placeHold");
        },
      } as unknown as TransactionCommitStore,
      isModeHHoldSubject: (id) => id === "modeh-pending-uuid-1" || id === "cs_test_pending_1",
    });

    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      for (const subjectId of ["modeh-pending-uuid-1", "cs_test_pending_1"]) {
        const res = await fetch(`${base}/transactions/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: `txn-${subjectId}`,
            attestationRef: "att-1",
            paymentMethodId: "pm_card_visa",
            peerUrl: "http://127.0.0.1:9",
            amountMinor: 100,
            currency: "EUR",
            subjectId,
          }),
        });
        expect(res.status).toBe(409);
        expect((await res.json()) as { error: string }).toMatchObject({
          error: expect.stringMatching(/Mode H commerce/),
        });
      }
      expect(placeHoldCalled).toBe(false);
    } finally {
      server.close();
    }
  });

  it("allows hold when subject is not Mode H", async () => {
    const app = express();
    app.use(express.json());
    let placeHoldCalled = false;
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          placeHoldCalled = true;
          return { transactionId: "txn-ok", status: "held" };
        },
      } as unknown as TransactionCommitStore,
      isModeHHoldSubject: () => false,
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
          transactionId: "txn-ok",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          subjectId: "room-booking-legacy",
        }),
      });
      expect(res.status).toBe(200);
      expect(placeHoldCalled).toBe(true);
    } finally {
      server.close();
    }
  });
});
