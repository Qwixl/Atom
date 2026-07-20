import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { createMockPaymentRail } from "./payment/mockRail.js";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { adminGetJson, adminPostJson, installTestAdminToken } from "./testHelpers.js";
import type { TransactionCommitRecord } from "./transactionCommitStore.js";

async function writeIdentityFile(filePath: string): Promise<void> {
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
}

function testConfig(port: number, publicBaseUrl: string): AgentBackendConfig {
  return {
    port,
    host: "127.0.0.1",
    publicBaseUrl,
    agentName: "Test agent",
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
  killSwitch: false,
  };
}

describe("M13.6 durable commerce state", () => {
  it("persists transaction commit records across server restart", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-m136-"));
    const identityPath = path.join(root, "agent.json");
    const prevIdentity = process.env.ATOM_AGENT_IDENTITY_PATH;
    process.env.ATOM_AGENT_IDENTITY_PATH = identityPath;
    await writeIdentityFile(identityPath);

    const port = 59010;
    const base = `http://127.0.0.1:${port}`;
    const transactionId = "txn-persist-001";
    let server: Server | undefined;

    try {
      server = await startAgentServer({
        config: testConfig(port, base),
        paymentRail: createMockPaymentRail(),
      });

      await adminPostJson(base, "/transactions/offer", {
        transactionId,
        attestationRef: "att-1",
        paymentMethodId: "pm_mock",
        peerUrl: `${base}/inbox`,
        amountMinor: 500,
        currency: "EUR",
        label: "Persist test",
      });

      const before = await adminGetJson<{ transactions: TransactionCommitRecord[] }>(
        base,
        "/transactions",
      );
      expect(before.transactions.some((t) => t.transactionId === transactionId)).toBe(true);

      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;

      const commitFile = path.join(root, "transaction-commit.json");
      const raw = await readFile(commitFile, "utf8");
      expect(raw).toContain(transactionId);

      server = await startAgentServer({
        config: testConfig(port, base),
        paymentRail: createMockPaymentRail(),
      });

      const after = await adminGetJson<{ transactions: TransactionCommitRecord[] }>(
        base,
        "/transactions",
      );
      const restored = after.transactions.find((t) => t.transactionId === transactionId);
      expect(restored?.phase).toBe("awaiting_payee_confirm");
      expect(restored?.amount.amountMinor).toBe(500);
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      restoreToken();
      if (prevIdentity === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentity;
    }
  });
});
