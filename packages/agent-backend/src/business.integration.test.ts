import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { COMMERCE_OFFER_PURPOSE } from "@qwixl/a2a-transport";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { adminGetJson, adminPostJson, installTestAdminToken } from "./testHelpers.js";

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

function testConfig(port: number, publicBaseUrl: string, businessMode: boolean): AgentBackendConfig {
  return {
    port,
    host: "127.0.0.1",
    publicBaseUrl,
    agentName: businessMode ? "Business agent" : "Buyer agent",
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    stripeSecretKey: "sk_test_mock",
    stripePublishableKey: null,
    stripeProductId: null,
    businessMode,
    businessDomain: businessMode ? "example.com" : null,
    demoPeerMode: false,
    communityHostMode: false,
    interactivePortResolve: false,
  };
}

async function postJson<T>(baseUrl: string, route: string, body: Record<string, unknown>): Promise<T> {
  return adminPostJson(baseUrl, route, body);
}

describe("M12 commerce intent → offer", () => {
  it("business agent matches catalog and replies with signed offer", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-m12-"));
    const buyerIdentityPath = path.join(root, "buyer.json");
    const businessIdentityPath = path.join(root, "business.json");

    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;
    process.env.ATOM_AGENT_IDENTITY_PATH = buyerIdentityPath;
    await writeIdentityFile(buyerIdentityPath);

    let buyerServer: Server | undefined;
    let businessServer: Server | undefined;

    try {
      const buyerPort = 59101;
      const businessPort = 59102;
      const buyerBase = `http://127.0.0.1:${buyerPort}`;
      const businessBase = `http://127.0.0.1:${businessPort}`;

      buyerServer = await startAgentServer({
        config: testConfig(buyerPort, buyerBase, false),
        paymentRail: createMockPaymentRail(),
      });

      process.env.ATOM_AGENT_IDENTITY_PATH = businessIdentityPath;
      await writeIdentityFile(businessIdentityPath);

      businessServer = await startAgentServer({
        config: testConfig(businessPort, businessBase, true),
        paymentRail: createMockPaymentRail(),
      });

      await postJson(businessBase, "/business/catalog", {
        catalogItemId: "room-standard",
        label: "Standard room · 2 nights",
        currency: "EUR",
        amountMinor: 8900,
        available: true,
        terms: ["Breakfast included"],
      });

      const buyerHealth = await adminGetJson<{ did: string }>(buyerBase, "/health");
      const businessHealth = await adminGetJson<{ did: string }>(businessBase, "/health");

      await postJson(buyerBase, "/business/intent", {
        intentId: "intent-m12-test",
        catalogItemId: "room-standard",
        replyUrl: buyerBase,
        peerUrl: businessBase,
        peerDid: businessHealth.did,
        encrypt: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const inbox = await adminGetJson<{
        entries: Array<{ object: { governance: { purpose: string }; payload: Record<string, unknown> } }>;
      }>(buyerBase, "/inbox");
      const offer = inbox.entries.find((e) => e.object.governance.purpose === COMMERCE_OFFER_PURPOSE);
      expect(offer).toBeDefined();
      expect(offer?.object.payload.label).toBe("Standard room · 2 nights");
      expect(offer?.object.payload.amount).toEqual({ currency: "EUR", amountMinor: 8900 });
      expect(buyerHealth.did).toBeTruthy();
    } finally {
      buyerServer?.close();
      businessServer?.close();
      process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  });
});
