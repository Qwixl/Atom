/**
 * BUS-ABUSE-01e — residual hostile E2E (diff F-3 / F-4 / F-6).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { createCommerceIntent } from "@qwixl/a2a-transport";
import { ABUSE_DEFAULTS, CommerceAbuseStore } from "./commerceAbuse.js";
import { a2aBlobLooksLikeCommerceIntent } from "./commerceAbuseAsleep.js";
import { createInboundReachabilityMiddleware } from "./reachability.js";
import { AsleepQueueStore } from "./asleepQueue.js";
import { BusinessStore } from "./businessStore.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import {
  TEST_ADMIN_TOKEN,
  adminPostJson,
  installTestAdminToken,
} from "./testHelpers.js";

const deliverSignedObject = vi.fn(async (_opts: unknown) => undefined);

vi.mock("./deliverObject.js", () => ({
  deliverSignedObject: (opts: unknown) => deliverSignedObject(opts),
}));

vi.mock("./commerceEligibility.js", () => ({
  assertHostedBusinessCommerceEligible: () => undefined,
  isHostedBusinessCommerceEligible: () => true,
}));

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

describe("BUS-ABUSE-01e F-3 live asleep + abuse store", () => {
  let dir: string;
  let prevRate: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-01e-asleep-"));
    prevRate = process.env.ATOM_COMMERCE_INTENT_RATE;
    process.env.ATOM_COMMERCE_INTENT_RATE = "1";
  });

  afterEach(async () => {
    if (prevRate === undefined) delete process.env.ATOM_COMMERCE_INTENT_RATE;
    else process.env.ATOM_COMMERCE_INTENT_RATE = prevRate;
    await new Promise((r) => setTimeout(r, 50));
    await rm(dir, { recursive: true, force: true });
  });

  it("exhausted intent budget → 429 commerce_rate_limited, not queued", async () => {
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse.json"),
      path.join(dir, "shopping.json"),
    );
    await abuse.load();
    abuse.assertInboundIntentAllowed("did:key:flood");
    expect(() => abuse.assertInboundIntentBudgetAvailable("did:key:flood")).toThrow(/rate limited/i);

    const queue = new AsleepQueueStore();
    const enqueued: unknown[] = [];
    const middleware = createInboundReachabilityMiddleware({
      config: { mode: "sleep", wakeSeed: "01e", forceAlwaysOn: false },
      now: () => new Date("2026-07-21T10:00:00.000Z"),
      enqueue: (input) => {
        if (input.fromDid && a2aBlobLooksLikeCommerceIntent(input.blob)) {
          abuse.assertInboundIntentBudgetAvailable(input.fromDid);
          abuse.assertSessionMintBudgetAvailable("default");
        }
        enqueued.push(input);
        queue.enqueue(input);
      },
    });

    const body = JSON.stringify({
      jsonrpc: "2.0",
      method: "message/send",
      params: { message: { parts: [{ kind: "data", data: { purpose: "commerce:intent" } }] } },
    });
    const req = Readable.from([Buffer.from(body)]) as IncomingMessage & { atomCallerDid?: string };
    req.method = "POST";
    req.atomCallerDid = "did:key:flood";

    const result = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const res = {
        statusCode: 200,
        setHeader() {},
        end(payload?: string | Buffer) {
          if (payload) chunks.push(typeof payload === "string" ? Buffer.from(payload) : payload);
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        },
      } as unknown as ServerResponse & { statusCode: number };
      middleware(req, res, (err?: unknown) => (err ? reject(err) : undefined));
    });

    expect(result.statusCode).toBe(429);
    expect(JSON.parse(result.body)).toMatchObject({
      error: "commerce_rate_limited",
      code: "rate_limited",
      queued: false,
    });
    expect(enqueued).toHaveLength(0);
  });
});

describe("BUS-ABUSE-01e F-4 inbox decline + suggest-mute", () => {
  let dir: string;
  let prevDecline: string | undefined;
  let prevIntent: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-01e-decline-"));
    prevDecline = process.env.ATOM_COMMERCE_DECLINE_RATE;
    prevIntent = process.env.ATOM_COMMERCE_INTENT_RATE;
    process.env.ATOM_COMMERCE_DECLINE_RATE = "2";
    process.env.ATOM_COMMERCE_INTENT_RATE = "1";
    deliverSignedObject.mockClear();
  });

  afterEach(async () => {
    if (prevDecline === undefined) delete process.env.ATOM_COMMERCE_DECLINE_RATE;
    else process.env.ATOM_COMMERCE_DECLINE_RATE = prevDecline;
    if (prevIntent === undefined) delete process.env.ATOM_COMMERCE_INTENT_RATE;
    else process.env.ATOM_COMMERCE_INTENT_RATE = prevIntent;
    await new Promise((r) => setTimeout(r, 50));
    await rm(dir, { recursive: true, force: true });
  });

  it("suppresses declines after outbound cap", async () => {
    const merchant = await generateAgentKeyPair();
    const buyer = await generateAgentKeyPair();
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse.json"),
      path.join(dir, "shopping.json"),
    );
    await abuse.load();
    abuse.assertInboundIntentAllowed(buyer.did);

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
      path.join(dir, "mode-h.json"),
    );
    await store.load();

    for (let n = 0; n < 4; n++) {
      const intent = await createCommerceIntent({
        identity: buyer,
        payload: {
          intentId: `intent-01e-cap-${n}`,
          catalogItemId: "sku",
          replyUrl: "http://127.0.0.1:9/",
        },
      });
      await store.handleInboxObject(intent);
    }
    // Intent rate=1 already spent → intents 2–4 are rate_limited; first may be no-match.
    // Decline rate=2 → at most 2 declines delivered.
    expect(deliverSignedObject).toHaveBeenCalledTimes(2);
  });

  it("fires suggest-mute after threshold rate_limited declines", async () => {
    const merchant = await generateAgentKeyPair();
    const buyer = await generateAgentKeyPair();
    const abuse = new CommerceAbuseStore(
      path.join(dir, "abuse-mute.json"),
      path.join(dir, "shopping-mute.json"),
    );
    await abuse.load();
    // Zero intent budget → every inbound intent is rate_limited (fail-closed).
    process.env.ATOM_COMMERCE_INTENT_RATE = "0";
    process.env.ATOM_COMMERCE_DECLINE_RATE = String(ABUSE_DEFAULTS.suggestMuteThreshold + 5);

    const mutes: string[] = [];
    const store = new BusinessStore(
      {
        localDid: merchant.did,
        identity: merchant,
        mlsStore: {} as MlsSessionStore,
        catalog: { list: () => [], get: () => undefined } as unknown as BusinessCatalogStore,
        businessMode: true,
        abuse,
        onSuggestMute: (peerDid) => {
          mutes.push(peerDid);
        },
      },
      path.join(dir, "intents-mute.json"),
      path.join(dir, "mode-h-mute.json"),
    );
    await store.load();

    for (let n = 0; n < ABUSE_DEFAULTS.suggestMuteThreshold; n++) {
      const intent = await createCommerceIntent({
        identity: buyer,
        payload: {
          intentId: `intent-01e-mute-${n}`,
          catalogItemId: "sku",
          replyUrl: "http://127.0.0.1:9/",
        },
      });
      await store.handleInboxObject(intent);
    }
    expect(deliverSignedObject.mock.calls.length).toBe(ABUSE_DEFAULTS.suggestMuteThreshold);
    expect(mutes).toContain(buyer.did);
  });
});

describe("BUS-ABUSE-01e F-6 unique-intent HTTP flood", () => {
  let restoreToken: (() => void) | undefined;
  let root: string;
  let server: Server | undefined;
  let base: string;
  let prevIdentity: string | undefined;
  let prevBuyer: string | undefined;

  beforeEach(async () => {
    restoreToken = installTestAdminToken();
    root = await mkdtemp(path.join(tmpdir(), "atom-01e-http-"));
    const identityPath = path.join(root, "buyer.json");
    prevIdentity = process.env.ATOM_AGENT_IDENTITY_PATH;
    prevBuyer = process.env.ATOM_COMMERCE_BUYER_INTENT_RATE;
    process.env.ATOM_AGENT_IDENTITY_PATH = identityPath;
    process.env.ATOM_COMMERCE_BUYER_INTENT_RATE = "2";
    await writeIdentityFile(identityPath);
    const port = 59401 + Math.floor(Math.random() * 80);
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
    if (prevBuyer === undefined) delete process.env.ATOM_COMMERCE_BUYER_INTENT_RATE;
    else process.env.ATOM_COMMERCE_BUYER_INTENT_RATE = prevBuyer;
    await new Promise((r) => setTimeout(r, 50));
    await rm(root, { recursive: true, force: true });
  });

  it("unique intentIds still hit buyer velocity 429", async () => {
    await adminPostJson(base, "/business/shopping", { enabled: true });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${base}/business/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          intentId: `intent-unique-${i}-${Date.now()}`,
          catalogItemId: "sku",
          peerUrl: "http://127.0.0.1:9/",
        }),
      });
      statuses.push(res.status);
    }
    // Rate=2: first two pass velocity (may 400 on delivery); next are 429.
    expect(statuses[0]).not.toBe(429);
    expect(statuses[1]).not.toBe(429);
    expect(statuses[2]).toBe(429);
    expect(statuses[3]).toBe(429);
    const last = await fetch(`${base}/business/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        intentId: `intent-unique-final-${Date.now()}`,
        catalogItemId: "sku",
        peerUrl: "http://127.0.0.1:9/",
      }),
    });
    expect(last.status).toBe(429);
    expect((await last.json()) as { code?: string }).toMatchObject({ code: "rate_limited" });
  });
});
