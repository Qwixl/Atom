import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import {
  COMMS_MESSAGE_PURPOSE,
  COMMS_MESSAGE_SCHEMA,
} from "@qwixl/a2a-transport";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { adminGetJson, adminPostJson, installTestAdminToken, TEST_ADMIN_TOKEN } from "./testHelpers.js";

async function writeIdentityFile(filePath: string): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
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
    agentName: "Contact policy test",
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    stripeSecretKey: null,
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

describe("contact block/mute policy", () => {
  it("blocks outbound send and drops inbound for blocked contacts", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-contacts-policy-"));
    const alicePath = path.join(root, "alice", "identity.json");
    const bobPath = path.join(root, "bob", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let aliceServer: Server | undefined;
    let bobServer: Server | undefined;

    try {
      process.env.ATOM_AGENT_IDENTITY_PATH = alicePath;
      const aliceDid = await writeIdentityFile(alicePath);
      const alicePort = 59101;
      const aliceBase = `http://127.0.0.1:${alicePort}`;
      aliceServer = await startAgentServer({ config: testConfig(alicePort, aliceBase) });

      process.env.ATOM_AGENT_IDENTITY_PATH = bobPath;
      const bobDid = await writeIdentityFile(bobPath);
      const bobPort = 59102;
      const bobBase = `http://127.0.0.1:${bobPort}`;
      bobServer = await startAgentServer({ config: testConfig(bobPort, bobBase) });

      await adminPostJson(aliceBase, "/mls/connect", {
        peerUrl: `${bobBase}/a2a/jsonrpc`,
        peerDid: bobDid,
      });

      await adminPostJson(aliceBase, "/contacts/sync", {
        contacts: [
          {
            did: bobDid,
            endpoint: `${bobBase}/a2a/jsonrpc`,
            name: "Bob",
            blocked: true,
          },
        ],
      });

      const blockedSend = await fetch(`${aliceBase}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          peerUrl: `${bobBase}/a2a/jsonrpc`,
          peerDid: bobDid,
          encrypt: true,
          message: {
            semantic: { schema: COMMS_MESSAGE_SCHEMA },
            payload: { text: "hello bob" },
            governance: { purpose: COMMS_MESSAGE_PURPOSE },
          },
        }),
      });
      expect(blockedSend.status).toBe(403);

      await adminPostJson(bobBase, "/send", {
        peerUrl: `${aliceBase}/a2a/jsonrpc`,
        peerDid: aliceDid,
        encrypt: true,
        message: {
          semantic: { schema: COMMS_MESSAGE_SCHEMA },
          payload: { text: "hello alice" },
          governance: { purpose: COMMS_MESSAGE_PURPOSE },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 400));

      const aliceInbox = await adminGetJson<{ entries: unknown[] }>(aliceBase, "/inbox");
      expect(aliceInbox.entries.length).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        aliceServer?.close((error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        bobServer?.close((error) => (error ? reject(error) : resolve()));
      });
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 120_000);
});
