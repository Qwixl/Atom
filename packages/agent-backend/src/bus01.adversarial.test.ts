import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
  createCommerceOffer,
  createCommerceOutcome,
  verifyCommerceOffer,
} from "@qwixl/a2a-transport";
import { isHostedBusinessCommerceEligible } from "./commerceEligibility.js";
import { createModeHCheckoutSession } from "./payment/modeHCheckout.js";
import {
  checkoutSessionIsPaid,
  verifyStripeWebhookSignature,
} from "./payment/stripeWebhook.js";
import { createHmac } from "node:crypto";
import express from "express";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { registerTransactionAdminRoutes } from "./transactionAdmin.js";
import type { TransactionCommitStore } from "./transactionCommitStore.js";
import { BusinessStore } from "./businessStore.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("BUS-01 adversarial — A1 hold fallback", () => {
  it("rejects Mode H hold via settlementMode and offer subjectId", async () => {
    let placeHoldCalled = false;
    const app = express();
    app.use(express.json());
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          placeHoldCalled = true;
          throw new Error("unreachable");
        },
      } as unknown as TransactionCommitStore,
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      for (const body of [
        {
          transactionId: "t1",
          attestationRef: "a",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          settlementMode: "merchant-checkout",
        },
        {
          transactionId: "t2",
          attestationRef: "a",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          subjectId: "offer-missing-checkout",
        },
      ]) {
        const res = await fetch(`${base}/transactions/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        expect(res.status).toBe(409);
      }
      expect(placeHoldCalled).toBe(false);
    } finally {
      server.close();
    }
  });

  it("BUS-01-HOLD-GATE rejects known pending Mode H subject without offer- prefix", async () => {
    let placeHoldCalled = false;
    const app = express();
    app.use(express.json());
    registerTransactionAdminRoutes(app, {
      stripeSecretKey: null,
      stripeProductId: null,
      paymentRail: createMockPaymentRail(),
      store: {
        offerHold: async () => {
          placeHoldCalled = true;
          throw new Error("unreachable");
        },
      } as unknown as TransactionCommitStore,
      isModeHHoldSubject: (id) => id === "pending-mode-h-uuid",
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
          transactionId: "t-hold-gate",
          attestationRef: "a",
          paymentMethodId: "pm_card_visa",
          peerUrl: "http://127.0.0.1:9",
          amountMinor: 100,
          currency: "EUR",
          subjectId: "pending-mode-h-uuid",
        }),
      });
      expect(res.status).toBe(409);
      expect(placeHoldCalled).toBe(false);
    } finally {
      server.close();
    }
  });

  it("shell acceptCommerceOffer refuses missing checkout without offerTransaction", () => {
    const panel = readFileSync(path.join(repoRoot, "apps/shell/src/CommsPanel.tsx"), "utf8");
    const fnStart = panel.indexOf("async function acceptCommerceOffer");
    const fnEnd = panel.indexOf("\n  function updateContactPolicy", fnStart);
    const body = panel.slice(fnStart, fnEnd);
    expect(body).toContain("Catalog hold is disabled");
    expect(body).not.toContain("offerTransaction");
    expect(body).not.toContain("pm_card_visa");
    expect(body).toContain("checkout.stripe.com");
  });
});

describe("BUS-01 adversarial — A2 Atom MoR claims", () => {
  it("confirmation copy states Atom does not take payment", () => {
    const panel = readFileSync(path.join(repoRoot, "apps/shell/src/CommsPanel.tsx"), "utf8");
    expect(panel).toContain("Atom does not take payment");
    expect(panel).toMatch(/Open merchant Stripe Checkout/);
  });

  it("Mode H Checkout uses Stripe-Account direct charge without application_fee", async () => {
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["Stripe-Account"]).toBe("acct_adv");
      expect(String(init?.body ?? "")).not.toContain("application_fee");
      expect(String(init?.body ?? "")).not.toContain("transfer_data");
      return new Response(
        JSON.stringify({
          id: "cs_test_adv",
          url: "https://checkout.stripe.com/c/pay/cs_test_adv",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200 },
      );
    };
    await createModeHCheckoutSession({
      secretKey: "sk_test",
      stripeAccountId: "acct_adv",
      offerId: "offer-a",
      intentId: "intent-a",
      label: "Item",
      amountMinor: 500,
      currency: "EUR",
      successUrl: "https://atom.qwixl.com/app/?commerce=success",
      cancelUrl: "https://atom.qwixl.com/app/?commerce=cancel",
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });
});

describe("BUS-01 adversarial — A3 no cards in shell commerce path", () => {
  it("Mode H shell surfaces do not persist payment method ids", () => {
    const files = [
      "apps/shell/src/CommsPanel.tsx",
      "apps/shell/src/comms/CoordinationCard.tsx",
      "apps/shell/src/comms/coordinationThread.ts",
      "apps/shell/src/comms/types.ts",
    ];
    for (const rel of files) {
      const text = readFileSync(path.join(repoRoot, rel), "utf8");
      // Legacy peer-split may still mention pm_card_visa outside acceptCommerceOffer;
      // Mode H accept path and coordination types must not.
      if (rel.endsWith("types.ts") || rel.endsWith("coordinationThread.ts")) {
        expect(text).not.toMatch(/pm_card/);
      }
    }
    const accept = readFileSync(path.join(repoRoot, "apps/shell/src/CommsPanel.tsx"), "utf8");
    const fnStart = accept.indexOf("async function acceptCommerceOffer");
    const fnEnd = accept.indexOf("\n  function updateContactPolicy", fnStart);
    expect(accept.slice(fnStart, fnEnd)).not.toMatch(/pm_|paymentMethod|cardNumber|client_secret/);
  });
});

describe("BUS-01 adversarial — A4 application fees", () => {
  it("modeHCheckout source never sets application_fee_amount param", () => {
    const src = readFileSync(
      path.join(repoRoot, "packages/agent-backend/src/payment/modeHCheckout.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/["']application_fee/);
    expect(src).not.toMatch(/\bapplication_fee_amount\s*:/);
  });
});

describe("BUS-01 adversarial — A5 non-Business merchants", () => {
  it("rejects ATOM_BUSINESS_MODE alone", async () => {
    expect(
      await isHostedBusinessCommerceEligible({
        ATOM_BUSINESS_MODE: "true",
        ATOM_HOSTED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("rejects env triad without signed entitlement", async () => {
    expect(
      await isHostedBusinessCommerceEligible({
        ATOM_COMMERCE_ELIGIBLE: "1",
        ATOM_WORKSPACE_KIND: "business",
        ATOM_HOSTED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("rejects incomplete triad", async () => {
    expect(
      await isHostedBusinessCommerceEligible({
        ATOM_COMMERCE_ELIGIBLE: "1",
        ATOM_WORKSPACE_KIND: "business",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("BUS-01 adversarial — wire / outcome", () => {
  it("rejects phishing checkout hosts", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createCommerceOffer({
        identity,
        payload: {
          offerId: "offer-phish",
          intentId: "intent-phish",
          catalogItemId: "sku-1",
          label: "Widget",
          amount: { currency: "EUR", amountMinor: 100 },
          available: true,
          terms: [],
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
          optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          checkoutUrl: "https://evil.example/checkout",
          checkoutSessionId: "cs_test_x",
        },
      }),
    ).rejects.toThrow(/Stripe Checkout host/);
  });

  it("accepts checkout.stripe.com host", async () => {
    const identity = await generateAgentKeyPair();
    const offer = await createCommerceOffer({
      identity,
      payload: {
        offerId: "offer-ok",
        intentId: "intent-ok",
        catalogItemId: "sku-1",
        label: "Widget",
        amount: { currency: "EUR", amountMinor: 100 },
        available: true,
        terms: [],
        settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_ok",
        checkoutSessionId: "cs_test_ok",
      },
    });
    const verified = await verifyCommerceOffer(offer);
    expect(verified.payload.checkoutSessionId).toBe("cs_test_ok");
  });

  it("buyer rejects forged outcome amount and duplicate spend", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-adv-"));
    const merchant = await generateAgentKeyPair();
    const buyer = await generateAgentKeyPair();
    const spend: Array<{ offerId: string }> = [];
    const { CommerceAbuseStore } = await import("./commerceAbuse.js");
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse.json"),
      path.join(dir, "shopping.json"),
    );
    await abuse.load();
    abuse.setAgentShoppingEnabled(true);
    const store = new BusinessStore(
      {
        localDid: buyer.did,
        identity: buyer,
        mlsStore: {} as MlsSessionStore,
        catalog: { list: () => [], get: () => undefined } as unknown as BusinessCatalogStore,
        businessMode: false,
        abuse,
        onCommerceOutcomePaid: ({ offerId }) => {
          spend.push({ offerId });
        },
      },
      path.join(dir, "intents.json"),
      path.join(dir, "mode-h.json"),
    );
    await store.load();

    try {
      const offer = await createCommerceOffer({
        identity: merchant,
        payload: {
          offerId: "offer-bind",
          intentId: "intent-bind",
          catalogItemId: "sku",
          label: "Item",
          amount: { currency: "EUR", amountMinor: 1200 },
          available: true,
          terms: [],
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
          optionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_bind",
          checkoutSessionId: "cs_bind",
        },
      });
      await store.handleInboxObject(offer);

      const badAmount = await createCommerceOutcome({
        identity: merchant,
        payload: {
          offerId: "offer-bind",
          intentId: "intent-bind",
          checkoutSessionId: "cs_bind",
          amount: { currency: "EUR", amountMinor: 9999 },
          paidAt: new Date().toISOString(),
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        },
      });
      await expect(store.handleInboxObject(badAmount)).rejects.toThrow(/amount/);

      const good = await createCommerceOutcome({
        identity: merchant,
        payload: {
          offerId: "offer-bind",
          intentId: "intent-bind",
          checkoutSessionId: "cs_bind",
          amount: { currency: "EUR", amountMinor: 1200 },
          paidAt: new Date().toISOString(),
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        },
      });
      await store.handleInboxObject(good);
      await store.handleInboxObject(good);
      expect(spend).toHaveLength(1);

      const wrongMerchant = await generateAgentKeyPair();
      const forged = await createCommerceOutcome({
        identity: wrongMerchant,
        payload: {
          offerId: "offer-bind",
          intentId: "intent-bind",
          checkoutSessionId: "cs_bind",
          amount: { currency: "EUR", amountMinor: 1200 },
          paidAt: new Date().toISOString(),
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        },
      });
      await expect(store.handleInboxObject(forged)).rejects.toThrow(/issuerDid/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("BUS-01 adversarial — webhook helpers", () => {
  it("rejects unpaid sessions and bad signatures", () => {
    expect(checkoutSessionIsPaid({ id: "cs_1", payment_status: "unpaid" })).toBe(false);
    const secret = "whsec_adv";
    const body = Buffer.from("{}", "utf8");
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.{}`, "utf8").digest("hex");
    expect(verifyStripeWebhookSignature(body, `t=${t},v1=${v1}`, secret, 300, t)).toBe(true);
    expect(verifyStripeWebhookSignature(body, `t=${t},v1=dead`, secret, 300, t)).toBe(false);
  });
});

describe("BUS-01 adversarial — static Mode H tree", () => {
  it("Mode H checkout + webhook modules never pass application_fee params", () => {
    const modeH = walkTsFiles(path.join(repoRoot, "packages/agent-backend/src/payment")).filter(
      (f) => /modeHCheckout\.ts$|stripeWebhook\.ts$/.test(f),
    );
    expect(modeH.length).toBeGreaterThan(0);
    for (const file of modeH) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/["']application_fee/);
      expect(text).not.toMatch(/\bapplication_fee_amount\s*:/);
    }
  });
});
