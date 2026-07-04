import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { ACTION_CAPTURE_PURPOSE, ACTION_RECEIPT_PURPOSE } from "@qwixl/a2a-transport";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";

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
    agentName: "Test agent",
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    googleCalendarAccessToken: null,
    stripeSecretKey: "sk_test_mock",
    stripePublishableKey: null,
    stripeProductId: null,
    businessMode: false,
    businessDomain: null,
  };
}

async function postJson<T>(baseUrl: string, route: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

async function getJson<T>(baseUrl: string, route: string): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${route}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${url}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

describe("M11.3 transaction commit choreography", () => {
  it("hold → payee confirm → payer capture over A2A", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atom-txn-"));
    const aliceIdentityPath = path.join(root, "alice.json");
    const bobIdentityPath = path.join(root, "bob.json");

    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;
    process.env.ATOM_AGENT_IDENTITY_PATH = aliceIdentityPath;
    await writeIdentityFile(aliceIdentityPath);

    const aliceRail = createMockPaymentRail();
    let aliceServer: Server | undefined;
    let bobServer: Server | undefined;

    try {
      const alicePort = 59001;
      const bobPort = 59002;
      aliceServer = await startAgentServer({
        config: testConfig(alicePort, `http://127.0.0.1:${alicePort}`),
        paymentRail: aliceRail,
      });
      const aliceBase = `http://127.0.0.1:${alicePort}`;
      const aliceHealth = await getJson<{ did: string }>(aliceBase, "/health");

      process.env.ATOM_AGENT_IDENTITY_PATH = bobIdentityPath;
      await writeIdentityFile(bobIdentityPath);
      bobServer = await startAgentServer({
        config: testConfig(bobPort, `http://127.0.0.1:${bobPort}`),
      });
      const bobBase = `http://127.0.0.1:${bobPort}`;
      const bobHealth = await getJson<{ did: string }>(bobBase, "/health");

      const bobPeer = bobBase;
      const transactionId = `txn-${crypto.randomUUID()}`;

      const offer = await postJson<{ transaction: { phase: string } }>(
        aliceBase,
        "/transactions/offer",
        {
          transactionId,
          peerUrl: bobPeer,
          peerDid: bobHealth.did,
          attestationRef: "attestation:1:payer-hold",
          paymentMethodId: "pm_mock",
          amountMinor: 5000,
          currency: "EUR",
          label: "Integration test item",
          encrypt: false,
        },
      );
      expect(offer.transaction.phase).toBe("awaiting_payee_confirm");

      await new Promise((resolve) => setTimeout(resolve, 150));

      const bobTxn = await getJson<{ transaction: { phase: string; localRole: string } }>(
        bobBase,
        `/transactions/${transactionId}`,
      );
      expect(bobTxn.transaction.localRole).toBe("payee");
      expect(bobTxn.transaction.phase).toBe("awaiting_payee_confirm");

      const alicePeer = aliceBase;
      const confirm = await postJson<{ transaction: { phase: string } }>(
        bobBase,
        "/transactions/confirm",
        {
          transactionId,
          attestationRef: "attestation:2:payee-confirm",
          peerUrl: alicePeer,
          peerDid: aliceHealth.did,
          encrypt: false,
        },
      );
      expect(confirm.transaction.phase).toBe("awaiting_capture");

      await new Promise((resolve) => setTimeout(resolve, 150));

      const aliceFinal = await getJson<{ transaction: { phase: string } }>(
        aliceBase,
        `/transactions/${transactionId}`,
      );
      expect(aliceFinal.transaction.phase).toBe("captured");
      expect(aliceRail.getHold(`mock_pi_${transactionId}`)?.status).toBe("succeeded");

      const bobInbox = await getJson<{
        entries: Array<{ object: { governance: { purpose: string } } }>;
      }>(bobBase, "/inbox");
      const purposes = bobInbox.entries.map((e) => e.object.governance.purpose);
      expect(purposes).toContain(ACTION_CAPTURE_PURPOSE);
      expect(purposes).toContain(ACTION_RECEIPT_PURPOSE);
    } finally {
      if (aliceServer) {
        await new Promise<void>((resolve, reject) => {
          aliceServer!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      if (bobServer) {
        await new Promise<void>((resolve, reject) => {
          bobServer!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      if (prevIdentityPath === undefined) {
        delete process.env.ATOM_AGENT_IDENTITY_PATH;
      } else {
        process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      }
    }
  });
});
