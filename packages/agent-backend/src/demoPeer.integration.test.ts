import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { COORDINATION_PROPOSAL_PURPOSE } from "@qwixl/a2a-transport";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
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

function testConfig(
  port: number,
  publicBaseUrl: string,
  demoPeerMode: boolean,
  agentName: string,
): AgentBackendConfig {
  return {
    port,
    host: "127.0.0.1",
    publicBaseUrl,
    agentName,
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    stripeSecretKey: null,
    stripePublishableKey: null,
    stripeProductId: null,
    businessMode: false,
    businessDomain: null,
    demoPeerMode,
    communityHostMode: false,
    businessKnowledgeBackend: "json",
    businessKnowledgeRemoteUrl: null,
    interactivePortResolve: false,
    brainAlwaysOn: true,
    brainIntervalMs: 60000,
  agentKind: "owner",
  killSwitch: false,
  ...testReachabilityDefaults({ publicBaseUrl }),
  };
}

describe("demo peer scheduling proposal", () => {
  it("delivers encrypted proposal to personal agent inbox after MLS connect", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-demo-peer-"));
    const userIdentityPath = path.join(root, "user.json");
    const demoIdentityPath = path.join(root, "demo.json");

    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;
    process.env.ATOM_AGENT_IDENTITY_PATH = userIdentityPath;
    await writeIdentityFile(userIdentityPath);

    let userServer: Server | undefined;
    let demoServer: Server | undefined;

    try {
      const userPort = 59011;
      const demoPort = 59012;
      const userBase = `http://127.0.0.1:${userPort}`;
      const demoBase = `http://127.0.0.1:${demoPort}`;
      const demoEndpoint = `${demoBase}/a2a/jsonrpc`;

      userServer = await startAgentServer({
        config: testConfig(userPort, userBase, false, "User agent"),
      });
      const userHealth = await adminGetJson<{ did: string }>(userBase, "/health");

      process.env.ATOM_AGENT_IDENTITY_PATH = demoIdentityPath;
      await writeIdentityFile(demoIdentityPath);
      demoServer = await startAgentServer({
        config: testConfig(demoPort, demoBase, true, "Demo peer"),
      });
      const demoHealth = await adminGetJson<{ did: string }>(demoBase, "/health");

      await adminPostJson(userBase, "/mls/connect", {
        peerUrl: demoEndpoint,
        peerDid: demoHealth.did,
        initiatorEndpoint: `${userBase}/a2a/jsonrpc`,
      });

      let inbox: {
        entries: { object: { governance: { purpose: string }; payload: { title?: string } } }[];
      } = { entries: [] };
      for (let attempt = 0; attempt < 40; attempt += 1) {
        inbox = await adminGetJson(userBase, "/inbox");
        if (inbox.entries.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (inbox.entries.length === 0) {
        await adminPostJson(demoBase, "/demo/resend-proposal", {
          peerDid: userHealth.did,
        });
        inbox = await adminGetJson(userBase, "/inbox");
      }

      expect(inbox.entries.length).toBeGreaterThan(0);
      expect(inbox.entries[0]?.object.governance.purpose).toBe(COORDINATION_PROPOSAL_PURPOSE);
      expect(inbox.entries[0]?.object.payload.title).toContain("Demo intro call");
    } finally {
      await new Promise<void>((resolve, reject) => {
        userServer?.close((error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        demoServer?.close((error) => (error ? reject(error) : resolve()));
      });
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  });
});
