import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import {
  TEST_ADMIN_TOKEN,
  adminPostJson,
  installTestAdminToken,
} from "./testHelpers.js";
import { a2aBlobLooksLikeCommerceIntent } from "./commerceAbuseAsleep.js";
import {
  encodeUrlsafeB64,
  signCommerceEntitlementCert,
} from "./commerceEntitlementCert.js";

async function installTestCommerceEntitlement(): Promise<void> {
  const kp = await generateAgentKeyPair();
  const issuedAt = new Date().toISOString();
  const renewBy = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  process.env.ATOM_COMMERCE_ENTITLEMENT = await signCommerceEntitlementCert(
    {
      workspaceKind: "business",
      commerceEligible: true,
      hosted: true,
      issuedAt,
      renewBy,
    },
    kp.privateKey,
  );
  process.env.ATOM_COMMERCE_MC_PUBLIC_KEY_B64 = encodeUrlsafeB64(kp.publicKey);
  process.env.ATOM_COMMERCE_ELIGIBLE = "1";
  process.env.ATOM_WORKSPACE_KIND = "business";
  process.env.ATOM_HOSTED = "1";
}

async function writeIdentityFile(filePath: string): Promise<string> {
  const keyPair = await generateAgentKeyPair();
  await writeFile(
    filePath,
    `${JSON.stringify({
      did: keyPair.did,
      publicKey: bytesToBase64(keyPair.publicKey),
      privateKey: bytesToBase64(keyPair.privateKey),
    })}\n`,
    { mode: 0o600 },
  );
  return keyPair.did;
}

function testConfig(port: number, publicBaseUrl: string): AgentBackendConfig {
  return {
    port,
    host: "127.0.0.1",
    publicBaseUrl,
    agentName: "Buyer agent",
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    stripeSecretKey: "sk_test_mock",
    stripePublishableKey: null,
    stripeProductId: null,
    businessMode: false,
    businessDomain: null,
    demoPeerMode: false,
    communityHostMode: false,
    businessKnowledgeBackend: "json",
    businessKnowledgeRemoteUrl: null,
    interactivePortResolve: false,
    brainAlwaysOn: true,
    brainIntervalMs: 60000,
    agentKind: "owner",
    meshBootstrap: false,
    killSwitch: false,
    ...testReachabilityDefaults({ publicBaseUrl }),
  };
}

describe("BUS-ABUSE-01 hostile HTTP matrix", () => {
  // Process-local abuse singleton path rebinding races if two servers share one store;
  // this file starts one server at a time — keep file serial relative to other server suites.
  // vitest pool: isolate via unique ATOM_AGENT_IDENTITY_PATH per test.

  let restoreToken: (() => void) | undefined;
  let root: string;
  let server: Server | undefined;
  let base: string;
  let prevIdentity: string | undefined;
  let prevMint: string | undefined;
  let prevWebhook: string | undefined;
  let prevWebhookMax: string | undefined;
  let prevBuyerIntent: string | undefined;

  beforeEach(async () => {
    restoreToken = installTestAdminToken();
    root = await mkdtemp(path.join(tmpdir(), "atom-abuse-http-"));
    const identityPath = path.join(root, "buyer.json");
    prevIdentity = process.env.ATOM_AGENT_IDENTITY_PATH;
    prevMint = process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET;
    prevWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    prevWebhookMax = process.env.ATOM_COMMERCE_WEBHOOK_RATE;
    prevBuyerIntent = process.env.ATOM_COMMERCE_BUYER_INTENT_RATE;
    process.env.ATOM_AGENT_IDENTITY_PATH = identityPath;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_hostile";
    process.env.ATOM_COMMERCE_WEBHOOK_RATE = "3";
    delete process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET;
    delete process.env.ATOM_COMMERCE_BUYER_INTENT_RATE;
    await writeIdentityFile(identityPath);
    const port = 59201 + Math.floor(Math.random() * 80);
    base = `http://127.0.0.1:${port}`;
    server = await startAgentServer({
      config: testConfig(port, base),
      paymentRail: createMockPaymentRail(),
    });
  });

  afterEach(async () => {
    server?.close();
    restoreToken?.();
    if (prevIdentity === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
    else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentity;
    if (prevMint === undefined) delete process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET;
    else process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = prevMint;
    if (prevWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhook;
    if (prevWebhookMax === undefined) delete process.env.ATOM_COMMERCE_WEBHOOK_RATE;
    else process.env.ATOM_COMMERCE_WEBHOOK_RATE = prevWebhookMax;
    if (prevBuyerIntent === undefined) delete process.env.ATOM_COMMERCE_BUYER_INTENT_RATE;
    else process.env.ATOM_COMMERCE_BUYER_INTENT_RATE = prevBuyerIntent;
    await new Promise((r) => setTimeout(r, 50));
    await rm(root, { recursive: true, force: true });
  });

  it("POST /business/intent returns 403 when Agent Shopping is off", async () => {
    const res = await fetch(`${base}/business/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        intentId: "intent-hostile-1",
        catalogItemId: "sku",
        peerUrl: "http://127.0.0.1:9/",
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("shopping_disabled");
  });

  it("GET/POST /business/shopping toggles enforcement", async () => {
    const off = await fetch(`${base}/business/shopping`, {
      headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    expect(off.status).toBe(200);
    const offBody = (await off.json()) as { agentShoppingEnabled: boolean };
    expect(offBody.agentShoppingEnabled).toBe(false);

    await adminPostJson(base, "/business/shopping", { enabled: true });
    const on = await fetch(`${base}/business/shopping`, {
      headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const onBody = (await on.json()) as { agentShoppingEnabled: boolean };
    expect(onBody.agentShoppingEnabled).toBe(true);
  });

  it("webhook IP rate limit returns 429 before HMAC work pays off", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/billing/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=deadbeef",
        },
        body: "{}",
      });
      // Cheap reject may be 400 (bad sig) while still counting IP.
      expect([400, 429]).toContain(res.status);
    }
    const blocked = await fetch(`${base}/billing/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "t=1,v1=deadbeef",
      },
      body: "{}",
    });
    expect(blocked.status).toBe(429);
  });

  it("buyer intent velocity returns 429 when Shopping is on", async () => {
    process.env.ATOM_COMMERCE_BUYER_INTENT_RATE = "1";
    await adminPostJson(base, "/business/shopping", { enabled: true });
    const first = await fetch(`${base}/business/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        intentId: "intent-vel-1",
        catalogItemId: "sku",
        peerUrl: "http://127.0.0.1:9/",
      }),
    });
    // First may 400 (delivery) after passing velocity, or 429 if already spent.
    expect([400, 429]).toContain(first.status);
    const second = await fetch(`${base}/business/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        intentId: "intent-vel-2",
        catalogItemId: "sku",
        peerUrl: "http://127.0.0.1:9/",
      }),
    });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe("rate_limited");
  });
});

describe("BUS-ABUSE-01a asleep commerce intent peek", () => {
  it("detects purpose in JSON-RPC-shaped blobs", () => {
    const blob = Buffer.from(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: {
          message: {
            parts: [{ kind: "data", data: { purpose: "commerce:intent" } }],
          },
        },
      }),
      "utf8",
    );
    expect(a2aBlobLooksLikeCommerceIntent(blob)).toBe(true);
  });

  it("ignores unrelated JSON", () => {
    expect(a2aBlobLooksLikeCommerceIntent(Buffer.from('{"purpose":"chat"}', "utf8"))).toBe(
      false,
    );
  });

  it("fail-closed on opaque blob containing the purpose string", () => {
    expect(
      a2aBlobLooksLikeCommerceIntent(Buffer.from("not-json commerce:intent tail", "utf8")),
    ).toBe(true);
  });
});

describe("BUS-ABUSE-01c/d wire proofs", () => {
  async function startIsolated(opts?: {
    corruptAbuse?: boolean;
    businessMode?: boolean;
  }): Promise<{
    base: string;
    server: Server;
    root: string;
    restoreToken: () => void;
    restoreEnv: () => void;
  }> {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-abuse-wire-"));
    const identityPath = path.join(root, "agent.json");
    const prev: Record<string, string | undefined> = {
      ATOM_AGENT_IDENTITY_PATH: process.env.ATOM_AGENT_IDENTITY_PATH,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      ATOM_COMMERCE_ABUSE: process.env.ATOM_COMMERCE_ABUSE,
      ATOM_COMMERCE_OFFER_RATE: process.env.ATOM_COMMERCE_OFFER_RATE,
      ATOM_COMMERCE_ELIGIBLE: process.env.ATOM_COMMERCE_ELIGIBLE,
      ATOM_COMMERCE_ENTITLEMENT: process.env.ATOM_COMMERCE_ENTITLEMENT,
      ATOM_COMMERCE_MC_PUBLIC_KEY_B64: process.env.ATOM_COMMERCE_MC_PUBLIC_KEY_B64,
      ATOM_WORKSPACE_KIND: process.env.ATOM_WORKSPACE_KIND,
      ATOM_HOSTED: process.env.ATOM_HOSTED,
    };
    process.env.ATOM_AGENT_IDENTITY_PATH = identityPath;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_wire";
    await writeIdentityFile(identityPath);
    if (opts?.corruptAbuse) {
      await writeFile(path.join(root, "commerce-abuse-counters.json"), "{not-json", "utf8");
    }
    const port = 59301 + Math.floor(Math.random() * 80);
    const base = `http://127.0.0.1:${port}`;
    const cfg = testConfig(port, base);
    if (opts?.businessMode) {
      Object.assign(cfg, {
        businessMode: true,
        agentName: "Business agent",
        businessDomain: "example.com",
      });
    }
    const server = await startAgentServer({
      config: cfg,
      paymentRail: createMockPaymentRail(),
    });
    return {
      base,
      server,
      root,
      restoreToken,
      restoreEnv: () => {
        for (const [k, v] of Object.entries(prev)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      },
    };
  }

  it("corrupt abuse counters → intent 503 abuse_store", async () => {
    const ctx = await startIsolated({ corruptAbuse: true });
    try {
      const res = await fetch(`${ctx.base}/business/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          intentId: "intent-corrupt",
          catalogItemId: "sku",
          peerUrl: "http://127.0.0.1:9/",
        }),
      });
      expect(res.status).toBe(503);
      expect((await res.json()) as { code?: string }).toMatchObject({ code: "abuse_store" });
    } finally {
      ctx.server.close();
      ctx.restoreToken();
      ctx.restoreEnv();
      await new Promise((r) => setTimeout(r, 50));
      await rm(ctx.root, { recursive: true, force: true });
    }
  });

  it("kill-switch off without attest → 403; attest unlocks", async () => {
    const ctx = await startIsolated();
    try {
      process.env.ATOM_COMMERCE_ABUSE = "off";
      await adminPostJson(ctx.base, "/business/shopping", { enabled: true });
      const denied = await fetch(`${ctx.base}/business/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          intentId: "intent-kill-1",
          catalogItemId: "sku",
          peerUrl: "http://127.0.0.1:9/",
        }),
      });
      expect(denied.status).toBe(403);
      expect((await denied.json()) as { code?: string }).toMatchObject({
        code: "abuse_kill_unattested",
      });

      await adminPostJson(ctx.base, "/business/shopping", { attestAbuseKillSwitch: true });
      const after = await fetch(`${ctx.base}/business/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          intentId: "intent-kill-2",
          catalogItemId: "sku",
          peerUrl: "http://127.0.0.1:9/",
        }),
      });
      // Unlimited after attest — delivery may still 400, but not kill-switch 403.
      expect(after.status).not.toBe(403);
      const body = (await after.json()) as { code?: string };
      expect(body.code).not.toBe("abuse_kill_unattested");
    } finally {
      delete process.env.ATOM_COMMERCE_ABUSE;
      ctx.server.close();
      ctx.restoreToken();
      ctx.restoreEnv();
      await new Promise((r) => setTimeout(r, 50));
      await rm(ctx.root, { recursive: true, force: true });
    }
  });

  it("POST /business/offer flood hits per-pair rate before Stripe", async () => {
    await installTestCommerceEntitlement();
    process.env.ATOM_COMMERCE_OFFER_RATE = "1";
    const ctx = await startIsolated({ businessMode: true });
    try {
      const body = {
        intentId: "intent-offer-flood",
        catalogItemId: "sku-missing",
        peerUrl: "http://127.0.0.1:9/",
        peerDid: "did:key:buyerFlood",
      };
      const first = await fetch(`${ctx.base}/business/offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify(body),
      });
      // Unknown catalog → 400 after rate increment, or 429 if already spent.
      expect([400, 429]).toContain(first.status);
      const second = await fetch(`${ctx.base}/business/offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ ...body, intentId: "intent-offer-flood-2" }),
      });
      expect(second.status).toBe(429);
      expect((await second.json()) as { code?: string }).toMatchObject({ code: "rate_limited" });
    } finally {
      ctx.server.close();
      ctx.restoreToken();
      ctx.restoreEnv();
      await new Promise((r) => setTimeout(r, 50));
      await rm(ctx.root, { recursive: true, force: true });
    }
  });
});
