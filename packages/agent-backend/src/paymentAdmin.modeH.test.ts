import { describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { ModeHOfferStore } from "./modeHOffers.js";
import { registerPaymentAdminRoutes } from "./paymentAdmin.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { PaymentRail } from "./payment/types.js";

function railWithPlaceHold(
  onPlaceHold: () => void,
  fail = false,
): PaymentRail {
  const rail = createMockPaymentRail();
  const original = rail.placeHold.bind(rail);
  rail.placeHold = async (input) => {
    onPlaceHold();
    if (fail) throw new Error("must not placeHold");
    return original(input);
  };
  return rail;
}

describe("paymentAdmin Mode H hold rejection (BUS-01-PAYMENTS-HOLD)", () => {
  it("returns 409 for merchant-checkout settlementMode", async () => {
    let placeHoldCalled = false;
    const identity = await generateAgentKeyPair();
    const app = express();
    app.use(express.json());
    registerPaymentAdminRoutes(app, {
      identity,
      mlsStore: {} as MlsSessionStore,
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeProductId: null,
      paymentRail: railWithPlaceHold(() => {
        placeHoldCalled = true;
      }, true),
      isModeHHoldSubject: () => false,
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const res = await fetch(`${base}/payments/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: "txn-1",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
          amountMinor: 100,
          currency: "EUR",
          settlementMode: "merchant-checkout",
          subjectId: "anything",
        }),
      });
      expect(res.status).toBe(409);
      expect((await res.json()) as { error: string }).toMatchObject({
        error: expect.stringMatching(/Mode H commerce/),
      });
      expect(placeHoldCalled).toBe(false);
    } finally {
      server.close();
    }
  });

  it("returns 409 for offer-* subjectId", async () => {
    const identity = await generateAgentKeyPair();
    const app = express();
    app.use(express.json());
    registerPaymentAdminRoutes(app, {
      identity,
      mlsStore: {} as MlsSessionStore,
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      isModeHHoldSubject: () => false,
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const res = await fetch(`${base}/payments/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: "txn-2",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
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

  it("returns 409 for known Mode H subject without offer- prefix", async () => {
    let placeHoldCalled = false;
    const identity = await generateAgentKeyPair();
    const app = express();
    app.use(express.json());
    registerPaymentAdminRoutes(app, {
      identity,
      mlsStore: {} as MlsSessionStore,
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeProductId: null,
      paymentRail: railWithPlaceHold(() => {
        placeHoldCalled = true;
      }, true),
      isModeHHoldSubject: (id) => id === "modeh-pending-uuid-1" || id === "intent-modeh-1",
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      for (const subjectId of ["modeh-pending-uuid-1", "intent-modeh-1"]) {
        const res = await fetch(`${base}/payments/hold`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: `txn-${subjectId}`,
            attestationRef: "att-1",
            paymentMethodId: "pm_card_visa",
            amountMinor: 100,
            currency: "EUR",
            subjectId,
          }),
        });
        expect(res.status).toBe(409);
      }
      expect(placeHoldCalled).toBe(false);
    } finally {
      server.close();
    }
  });

  it("allows hold when subject is not Mode H", async () => {
    let placeHoldCalled = false;
    const identity = await generateAgentKeyPair();
    const app = express();
    app.use(express.json());
    registerPaymentAdminRoutes(app, {
      identity,
      mlsStore: {} as MlsSessionStore,
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeProductId: null,
      paymentRail: railWithPlaceHold(() => {
        placeHoldCalled = true;
      }),
      isModeHHoldSubject: () => false,
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const res = await fetch(`${base}/payments/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: "txn-ok",
          attestationRef: "att-1",
          paymentMethodId: "pm_card_visa",
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

  it("BUS-01-HOLD-EVICT: post-eviction real store blocks /payments/hold", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-pay-evict-"));
    try {
      const offers = new ModeHOfferStore(path.join(dir, "mode-h.json"));
      await offers.load();
      offers.upsert({
        offerId: "http-evict-offer",
        intentId: "http-evict-intent",
        checkoutSessionId: "cs_http_evict",
        amount: { currency: "EUR", amountMinor: 100 },
        label: "Item",
        buyerPeerUrl: "http://127.0.0.1:9",
        createdAt: new Date().toISOString(),
        optionExpiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      offers.assertCanAcceptPending();
      expect(offers.getByOfferId("http-evict-offer")).toBeUndefined();

      let placeHoldCalled = false;
      const identity = await generateAgentKeyPair();
      const app = express();
      app.use(express.json());
      registerPaymentAdminRoutes(app, {
        identity,
        mlsStore: {} as MlsSessionStore,
        stripeSecretKey: null,
        stripePublishableKey: null,
        stripeProductId: null,
        paymentRail: railWithPlaceHold(() => {
          placeHoldCalled = true;
        }, true),
        isModeHHoldSubject: (id) => offers.isHoldSubject(id),
      });
      const server = app.listen(0);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      const base = `http://127.0.0.1:${address.port}`;
      try {
        for (const subjectId of [
          "http-evict-offer",
          "cs_http_evict",
          "http-evict-intent",
        ]) {
          const res = await fetch(`${base}/payments/hold`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transactionId: `txn-${subjectId}`,
              attestationRef: "att-1",
              paymentMethodId: "pm_card_visa",
              amountMinor: 100,
              currency: "EUR",
              subjectId,
            }),
          });
          expect(res.status).toBe(409);
        }
        expect(placeHoldCalled).toBe(false);
      } finally {
        server.close();
      }
    } finally {
      await new Promise((r) => setTimeout(r, 50));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
