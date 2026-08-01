import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { BusinessStore } from "./businessStore.js";
import { CommerceAbuseStore } from "./commerceAbuse.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import { setConnectAccount } from "./connectAccounts.js";

const createModeHCheckoutSession = vi.fn(
  async (_opts: unknown): Promise<{ sessionId: string; url: string }> => ({
    sessionId: "cs_test_mint",
    url: "https://checkout.stripe.com/c/pay/cs_test_mint",
  }),
);

vi.mock("./payment/modeHCheckout.js", () => ({
  createModeHCheckoutSession: (opts: unknown) => createModeHCheckoutSession(opts),
}));

vi.mock("./commerceEligibility.js", () => ({
  assertHostedBusinessCommerceEligible: () => undefined,
  isHostedBusinessCommerceEligible: () => true,
}));

vi.mock("./deliverObject.js", () => ({
  deliverSignedObject: vi.fn(async () => undefined),
}));

describe("BUS-ABUSE-01c mint budget blocks Stripe", () => {
  let dir: string;
  let prevIdentity: string | undefined;
  let prevMint: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-mint-block-"));
    prevIdentity = process.env.ATOM_AGENT_IDENTITY_PATH;
    prevMint = process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET;
    process.env.ATOM_AGENT_IDENTITY_PATH = path.join(dir, "id.json");
    process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = "1";
    createModeHCheckoutSession.mockClear();
  });

  afterEach(async () => {
    if (prevIdentity === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
    else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentity;
    if (prevMint === undefined) delete process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET;
    else process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = prevMint;
    await new Promise((r) => setTimeout(r, 50));
    await rm(dir, { recursive: true, force: true });
  });

  it("exhausts mint budget without a second Stripe Session create", async () => {
    const merchant = await generateAgentKeyPair();
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse.json"),
      path.join(dir, "shopping.json"),
    );
    await abuse.load();
    setConnectAccount({
      workspaceId: "ws-mint",
      stripeAccountId: "acct_test",
      chargesEnabled: true,
      detailsSubmitted: true,
      updatedAt: new Date().toISOString(),
    });

    const catalogItem = {
      catalogItemId: "sku-1",
      label: "Widget",
      amount: { currency: "EUR", amountMinor: 500 },
      available: true,
      terms: [] as string[],
    };
    let availableFlips = 0;
    const catalog = {
      list: () => [catalogItem],
      get: (id: string) => (id === "sku-1" ? catalogItem : undefined),
      upsert: () => {
        availableFlips += 1;
        catalogItem.available = false;
      },
    } as unknown as BusinessCatalogStore;

    const store = new BusinessStore(
      {
        localDid: merchant.did,
        identity: merchant,
        mlsStore: {} as MlsSessionStore,
        catalog,
        businessMode: true,
        stripeSecretKey: "sk_test_mock",
        commerceWorkspaceId: "ws-mint",
        abuse,
      },
      path.join(dir, "intents.json"),
      path.join(dir, "mode-h.json"),
    );
    await store.load();

    await store.sendOffer({
      intentId: "intent-1",
      catalogItemId: "sku-1",
      peerUrl: "http://127.0.0.1:9/",
      peerDid: "did:key:buyer1",
    });
    expect(createModeHCheckoutSession).toHaveBeenCalledTimes(1);
    expect(catalogItem.available).toBe(true);
    expect(availableFlips).toBe(0);

    await expect(
      store.sendOffer({
        intentId: "intent-2",
        catalogItemId: "sku-1",
        peerUrl: "http://127.0.0.1:9/",
        peerDid: "did:key:buyer2",
      }),
    ).rejects.toThrow(/mint budget/i);
    expect(createModeHCheckoutSession).toHaveBeenCalledTimes(1);
    expect(catalogItem.available).toBe(true);
  });
});
