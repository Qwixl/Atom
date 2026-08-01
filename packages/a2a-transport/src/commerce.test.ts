import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  COMMERCE_DECLINE_PURPOSE,
  COMMERCE_INTENT_PURPOSE,
  COMMERCE_OFFER_PURPOSE,
  COMMERCE_OUTCOME_PURPOSE,
  COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
} from "./constants.js";
import {
  createCommerceDecline,
  createCommerceIntent,
  createCommerceOffer,
  createCommerceOutcome,
  verifyCommerceIntent,
  verifyCommerceOffer,
  verifyCommerceOutcome,
} from "./commerce.js";

const amount = { currency: "EUR", amountMinor: 4500 };

describe("M12 commerce objects", () => {
  it("round-trips intent and offer with signed rankable fields", async () => {
    const identity = await generateAgentKeyPair();
    const intent = await createCommerceIntent({
      identity,
      payload: {
        intentId: "intent-1",
        catalogItemId: "room-standard",
        constraints: { maxAmountMinor: 5000, currency: "EUR" },
      },
    });
    expect((await verifyCommerceIntent(intent)).object.governance.purpose).toBe(
      COMMERCE_INTENT_PURPOSE,
    );

    const offer = await createCommerceOffer({
      identity,
      payload: {
        offerId: "offer-1",
        intentId: "intent-1",
        catalogItemId: "room-standard",
        label: "Standard room · 2 nights",
        amount,
        available: true,
        terms: ["Free cancellation until 48h before check-in"],
        sponsored: false,
      },
    });
    const verified = await verifyCommerceOffer(offer);
    expect(verified.object.governance.purpose).toBe(COMMERCE_OFFER_PURPOSE);
    expect(verified.payload.terms).toHaveLength(1);
  });

  it("round-trips Mode H merchant-checkout offer fields", async () => {
    const identity = await generateAgentKeyPair();
    const offer = await createCommerceOffer({
      identity,
      payload: {
        offerId: "offer-mh-1",
        intentId: "intent-mh-1",
        catalogItemId: "sku-1",
        label: "Widget",
        amount,
        available: true,
        terms: ["Ships in 2 days"],
        settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        optionExpiresAt: "2026-08-02T12:00:00.000Z",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_abc",
        checkoutSessionId: "cs_test_abc",
      },
    });
    const verified = await verifyCommerceOffer(offer);
    expect(verified.payload.settlementMode).toBe(COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT);
    expect(verified.payload.checkoutSessionId).toBe("cs_test_abc");
  });

  it("rejects Mode H offer with http checkoutUrl", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createCommerceOffer({
        identity,
        payload: {
          offerId: "offer-bad",
          intentId: "intent-bad",
          catalogItemId: "sku-1",
          label: "Widget",
          amount,
          available: true,
          terms: [],
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
          optionExpiresAt: "2026-08-02T12:00:00.000Z",
          checkoutUrl: "http://insecure.example/pay",
          checkoutSessionId: "cs_test_bad",
        },
      }),
    ).rejects.toThrow(/https/);
  });

  it("rejects Mode H offer with non-Stripe checkout host", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createCommerceOffer({
        identity,
        payload: {
          offerId: "offer-phish",
          intentId: "intent-phish",
          catalogItemId: "sku-1",
          label: "Widget",
          amount,
          available: true,
          terms: [],
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
          optionExpiresAt: "2026-08-02T12:00:00.000Z",
          checkoutUrl: "https://evil.example/pay",
          checkoutSessionId: "cs_test_phish",
        },
      }),
    ).rejects.toThrow(/Stripe Checkout host/);
  });

  it("round-trips commerce:outcome", async () => {
    const identity = await generateAgentKeyPair();
    const outcome = await createCommerceOutcome({
      identity,
      payload: {
        offerId: "offer-mh-1",
        intentId: "intent-mh-1",
        checkoutSessionId: "cs_test_abc",
        amount,
        paidAt: "2026-08-01T18:00:00.000Z",
        settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        stripePaymentIntentId: "pi_test_1",
      },
    });
    const verified = await verifyCommerceOutcome(outcome);
    expect(verified.object.governance.purpose).toBe(COMMERCE_OUTCOME_PURPOSE);
    expect(verified.payload.checkoutSessionId).toBe("cs_test_abc");
  });

  it("round-trips decline", async () => {
    const identity = await generateAgentKeyPair();
    const decline = await createCommerceDecline({
      identity,
      payload: { intentId: "intent-9", reasonCode: "no-match", note: "No inventory" },
    });
    expect(decline.governance.purpose).toBe(COMMERCE_DECLINE_PURPOSE);
  });
});
