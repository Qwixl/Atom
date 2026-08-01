import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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

  it("BUS-01-HOLD-EVICT: hold subjects survive option eviction", () => {
    store.upsert({
      offerId: "pending-uuid-evict",
      intentId: "intent-evict-1",
      checkoutSessionId: "cs_test_evict",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "Item",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(store.isHoldSubject("pending-uuid-evict")).toBe(true);
    store.assertCanAcceptPending();
    expect(store.getByOfferId("pending-uuid-evict")).toBeUndefined();
    expect(store.isHoldSubject("pending-uuid-evict")).toBe(true);
    expect(store.isHoldSubject("cs_test_evict")).toBe(true);
    expect(store.isHoldSubject("intent-evict-1")).toBe(true);
  });

  it("BUS-01-HOLD-EVICT: load backfills quarantine without post-deploy upsert", async () => {
    const filePath = path.join(dir, "mode-h-upgrade.json");
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        offers: [
          {
            offerId: "upgrade-offer",
            intentId: "upgrade-intent",
            checkoutSessionId: "cs_upgrade",
            amount: { currency: "EUR", amountMinor: 50 },
            label: "Up",
            buyerPeerUrl: "http://127.0.0.1:1",
            createdAt: new Date().toISOString(),
            optionExpiresAt: new Date(Date.now() - 5000).toISOString(),
          },
        ],
      }),
      "utf8",
    );
    const upgraded = new ModeHOfferStore(filePath);
    await upgraded.load();
    upgraded.assertCanAcceptPending();
    expect(upgraded.getByOfferId("upgrade-offer")).toBeUndefined();
    expect(upgraded.isHoldSubject("upgrade-offer")).toBe(true);
    expect(upgraded.isHoldSubject("cs_upgrade")).toBe(true);
    expect(upgraded.isHoldSubject("upgrade-intent")).toBe(true);
  });

  it("BUS-01-HOLD-EVICT: quarantine until is monotonic on session reuse", () => {
    const earlyExpiry = new Date(Date.now() + 60_000).toISOString();
    store.upsert({
      offerId: "reuse-offer",
      intentId: "reuse-intent",
      checkoutSessionId: "cs_reuse",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "A",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: earlyExpiry,
    });
    const untilAfterFirst = (store as unknown as { holdQuarantine: Map<string, number> })
      .holdQuarantine.get("cs_reuse");
    expect(untilAfterFirst).toBeGreaterThan(Date.now());

    store.upsert({
      offerId: "reuse-offer",
      intentId: "reuse-intent",
      checkoutSessionId: "cs_reuse",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "A",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() - 10_000).toISOString(),
    });
    const untilAfterShrinkAttempt = (
      store as unknown as { holdQuarantine: Map<string, number> }
    ).holdQuarantine.get("cs_reuse");
    expect(untilAfterShrinkAttempt).toBe(untilAfterFirst);
  });

  it("BUS-01-HOLD-EVICT: corrupt optionExpiresAt uses now+30d base", () => {
    store.upsert({
      offerId: "corrupt-offer",
      intentId: "corrupt-intent",
      checkoutSessionId: "cs_corrupt",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "X",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: "not-a-date",
    });
    expect(store.isHoldSubject("corrupt-offer")).toBe(true);
    const until = (store as unknown as { holdQuarantine: Map<string, number> }).holdQuarantine.get(
      "corrupt-offer",
    );
    expect(until).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("BUS-01-HOLD-EVICT: quarantine persists across restart", async () => {
    const filePath = path.join(dir, "mode-h-restart.json");
    const first = new ModeHOfferStore(filePath);
    await first.load();
    first.upsert({
      offerId: "restart-offer",
      intentId: "restart-intent",
      checkoutSessionId: "cs_restart",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "R",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    first.assertCanAcceptPending();
    await first.flush();

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      offers: unknown[];
      holdQuarantine?: Record<string, string>;
    };
    expect(raw.offers).toEqual([]);
    expect(raw.holdQuarantine?.["restart-offer"]).toMatch(/^\d{4}-/);
    expect(Date.parse(raw.holdQuarantine!["restart-offer"]!)).toBeGreaterThan(Date.now());
    expect(raw.holdQuarantine?.["cs_restart"]).toBeTruthy();
    expect(raw.holdQuarantine?.["restart-intent"]).toBeTruthy();

    const second = new ModeHOfferStore(filePath);
    await second.load();
    expect(second.getByOfferId("restart-offer")).toBeUndefined();
    expect(second.isHoldSubject("restart-offer")).toBe(true);
    expect(second.isHoldSubject("cs_restart")).toBe(true);
    expect(second.isHoldSubject("restart-intent")).toBe(true);
  });

  it("BUS-01-HOLD-EVICT: post-TTL quarantine releases subject (A6)", () => {
    store.upsert({
      offerId: "ttl-offer",
      intentId: "ttl-intent",
      checkoutSessionId: "cs_ttl",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "T",
      buyerPeerUrl: "http://127.0.0.1:1",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    store.assertCanAcceptPending();
    expect(store.isHoldSubject("ttl-offer")).toBe(true);
    const q = (store as unknown as { holdQuarantine: Map<string, number> }).holdQuarantine;
    q.set("ttl-offer", Date.now() - 1);
    q.set("cs_ttl", Date.now() - 1);
    q.set("ttl-intent", Date.now() - 1);
    expect(store.isHoldSubject("ttl-offer")).toBe(false);
    expect(store.isHoldSubject("cs_ttl")).toBe(false);
    expect(store.isHoldSubject("ttl-intent")).toBe(false);
    expect(q.has("ttl-offer")).toBe(false);
  });
});
