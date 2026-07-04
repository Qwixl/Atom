import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  COMMERCE_DECLINE_PURPOSE,
  COMMERCE_INTENT_PURPOSE,
  COMMERCE_OFFER_PURPOSE,
} from "./constants.js";
import {
  createCommerceDecline,
  createCommerceIntent,
  createCommerceOffer,
  verifyCommerceIntent,
  verifyCommerceOffer,
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

  it("round-trips decline", async () => {
    const identity = await generateAgentKeyPair();
    const decline = await createCommerceDecline({
      identity,
      payload: { intentId: "intent-9", reasonCode: "no-match", note: "No inventory" },
    });
    expect(decline.governance.purpose).toBe(COMMERCE_DECLINE_PURPOSE);
  });
});
