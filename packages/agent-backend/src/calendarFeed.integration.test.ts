import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import { adminGetJson, installTestAdminToken } from "./testHelpers.js";

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
    agentName: "Calendar feed agent",
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
  ...testReachabilityDefaults({ publicBaseUrl }),
  };
}

describe("calendar publish feed routes", () => {
  it("serves ICS at secret token URL without admin auth", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-cal-feed-route-"));
    const identityPath = path.join(root, "agent.json");

    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;
    process.env.ATOM_AGENT_IDENTITY_PATH = identityPath;
    await writeIdentityFile(identityPath);

    let server: Server | undefined;

    try {
      const port = 59031;
      const base = `http://127.0.0.1:${port}`;
      server = await startAgentServer({ config: testConfig(port, base) });

      const feedMeta = await adminGetJson<{
        feedUrl: string;
        webcalUrl: string;
        eventCount: number;
      }>(base, "/calendar/feed");

      expect(feedMeta.webcalUrl).toMatch(/^webcal:\/\//);
      expect(feedMeta.eventCount).toBe(0);

      const unauthorized = await fetch(`${base}/calendar/feed.ics`);
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(feedMeta.feedUrl);
      expect(authorized.status).toBe(200);
      expect(authorized.headers.get("content-type")).toContain("text/calendar");
      const body = await authorized.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("METHOD:PUBLISH");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  });
});
