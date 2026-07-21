import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import { COFFEE_SHOP_ROOM_ID } from "./communityCoffeeShop.js";
import { adminGetJson, adminPostJson, installTestAdminToken } from "./testHelpers.js";

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

function testConfig(port: number, publicBaseUrl: string, communityHostMode = false): AgentBackendConfig {
  return {
    port,
    host: "127.0.0.1",
    publicBaseUrl,
    agentName: communityHostMode ? "Coffee Shop host" : "Member agent",
    allowedOrigins: new Set(["http://127.0.0.1:5200"]),
    stripeSecretKey: null,
    stripePublishableKey: null,
    stripeProductId: null,
    businessMode: false,
    businessDomain: null,
    demoPeerMode: false,
    communityHostMode,
    businessKnowledgeBackend: "json",
    businessKnowledgeRemoteUrl: null,
    interactivePortResolve: false,
    brainAlwaysOn: true,
    brainIntervalMs: 60000,
  agentKind: "owner",
  killSwitch: false,
  ...testReachabilityDefaults({ publicBaseUrl, communityHostMode }),
  };
}

describe("MLS group rooms", () => {
  it("member joins remote room and message appears on host", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-rooms-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const memberIdentityPath = path.join(root, "member", "identity.json");

    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let memberServer: Server | undefined;

    try {
      process.env.ATOM_AGENT_IDENTITY_PATH = hostIdentityPath;
      await writeIdentityFile(hostIdentityPath);

      const hostPort = 59021;
      const memberPort = 59022;
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const memberBase = `http://127.0.0.1:${memberPort}`;

      hostServer = await startAgentServer({
        config: testConfig(hostPort, hostBase, true),
      });

      const hostRooms = await adminGetJson<{ hosted: { roomId: string }[] }>(hostBase, "/rooms");
      expect(hostRooms.hosted.some((room) => room.roomId === COFFEE_SHOP_ROOM_ID)).toBe(true);

      process.env.ATOM_AGENT_IDENTITY_PATH = memberIdentityPath;
      await writeIdentityFile(memberIdentityPath);

      memberServer = await startAgentServer({
        config: testConfig(memberPort, memberBase, false),
      });

      const memberHealth = await adminGetJson<{ did: string }>(memberBase, "/health");
      const memberDid = memberHealth.did;

      await adminPostJson(memberBase, "/rooms/join-remote", {
        hostUrl: hostBase,
        roomId: COFFEE_SHOP_ROOM_ID,
        memberName: "Test member",
      });

      const rejoin = await adminPostJson<{ joined: string; alreadyMember?: boolean }>(
        memberBase,
        "/rooms/join-remote",
        {
          hostUrl: hostBase,
          roomId: COFFEE_SHOP_ROOM_ID,
          memberName: "Test member",
        },
      );
      expect(rejoin.joined).toBe(COFFEE_SHOP_ROOM_ID);
      expect(rejoin.alreadyMember).toBe(true);

      await adminPostJson(memberBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: "hello coffee shop",
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const messages = await adminGetJson<{
        messages: Array<{ text?: string; senderDid: string }>;
      }>(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/messages`);

      expect(messages.messages.some((msg) => msg.text === "hello coffee shop")).toBe(true);

      await adminPostJson(memberBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/leave`, {});

      const hostMembers = await adminGetJson<{ members: Array<{ did: string }> }>(
        hostBase,
        `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/members`,
      );
      expect(hostMembers.members.some((member) => member.did === memberDid)).toBe(false);

      const memberRooms = await adminGetJson<{ joined: Array<{ roomId: string }> }>(memberBase, "/rooms");
      expect(memberRooms.joined.some((row) => row.roomId === COFFEE_SHOP_ROOM_ID)).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        hostServer?.close((error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        memberServer?.close((error) => (error ? reject(error) : resolve()));
      });
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 120_000);
});
