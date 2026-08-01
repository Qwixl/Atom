import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModeHOfferStore } from "./modeHOffers.js";

describe("ModeHOfferStore", () => {
  let dir: string;
  let store: ModeHOfferStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-mode-h-"));
    store = new ModeHOfferStore(path.join(dir, "mode-h-offers.json"));
    await store.load();
  });

  afterEach(async () => {
    delete process.env.ATOM_MODE_H_PENDING_MAX;
    await new Promise((r) => setTimeout(r, 80));
    await rm(dir, { recursive: true, force: true });
  });

  it("upserts and marks outcome minted with event idempotency", async () => {
    store.upsert({
      offerId: "offer-1",
      intentId: "intent-1",
      checkoutSessionId: "cs_test_1",
      amount: { currency: "EUR", amountMinor: 8900 },
      label: "Room",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
    });
    expect(store.getBySessionId("cs_test_1")?.offerId).toBe("offer-1");
    store.markOutcomeMinted("cs_test_1", "evt_1");
    expect(store.getBySessionId("cs_test_1")?.outcomeMintedAt).toBeTruthy();
    expect(store.hasProcessedEvent("evt_1")).toBe(true);
    // Allow async persist to finish before temp dir cleanup.
    await new Promise((r) => setTimeout(r, 50));
  });

  it("refuses new pending rows at Mode H pending cap", () => {
    process.env.ATOM_MODE_H_PENDING_MAX = "1";
    store.upsert({
      offerId: "offer-cap-1",
      intentId: "intent-cap-1",
      checkoutSessionId: "cs_cap_1",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "A",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(() =>
      store.upsert({
        offerId: "offer-cap-2",
        intentId: "intent-cap-2",
        checkoutSessionId: "cs_cap_2",
        amount: { currency: "EUR", amountMinor: 100 },
        label: "B",
        buyerPeerUrl: "http://127.0.0.1:1",
        createdAt: new Date().toISOString(),
        optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ).toThrow(/pending offer cap/i);
    delete process.env.ATOM_MODE_H_PENDING_MAX;
  });
});
