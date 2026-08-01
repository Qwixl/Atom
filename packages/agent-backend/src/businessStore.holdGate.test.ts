import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { BusinessStore } from "./businessStore.js";
import { CommerceAbuseStore } from "./commerceAbuse.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import { ModeHOfferStore } from "./modeHOffers.js";

describe("BUS-01-HOLD-GATE BusinessStore.isModeHHoldSubject", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-hold-gate-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    await rm(dir, { recursive: true, force: true });
  });

  it("matches pending offerId and checkoutSessionId", async () => {
    const merchant = await generateAgentKeyPair();
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse.json"),
      path.join(dir, "shopping.json"),
    );
    await abuse.load();
    const modeHPath = path.join(dir, "mode-h.json");
    const offers = new ModeHOfferStore(modeHPath);
    await offers.load();
    offers.upsert({
      offerId: "pending-uuid-abc",
      intentId: "intent-1",
      checkoutSessionId: "cs_test_hold_gate",
      amount: { currency: "EUR", amountMinor: 100 },
      label: "Item",
      buyerPeerUrl: "http://127.0.0.1:9",
      createdAt: new Date().toISOString(),
      optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await offers.flush();

    const store = new BusinessStore(
      {
        localDid: merchant.did,
        identity: merchant,
        mlsStore: {} as MlsSessionStore,
        catalog: { list: () => [], get: () => undefined } as unknown as BusinessCatalogStore,
        businessMode: true,
        abuse,
      },
      path.join(dir, "intents.json"),
      modeHPath,
    );
    await store.load();

    expect(store.isModeHHoldSubject("pending-uuid-abc")).toBe(true);
    expect(store.isModeHHoldSubject("cs_test_hold_gate")).toBe(true);
    expect(store.isModeHHoldSubject("unrelated-subject")).toBe(false);
  });
});
