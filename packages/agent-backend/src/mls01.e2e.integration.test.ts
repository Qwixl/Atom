/**
 * MLS-01 / D135 — live 3-agent E2E acceptance matrix (founder 6A).
 *
 * Proves commit fan-out across real agent backends, post-traffic restart via
 * mls-sessions.json, and remove + restart for survivors.
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import { COFFEE_SHOP_ROOM_ID } from "./communityCoffeeShop.js";
import { resetRoomChainTrackers } from "./roomsAdmin.js";
import { adminGetJson, adminPostJson, installTestAdminToken } from "./testHelpers.js";

interface MemberMessages {
  messages: Array<{ text?: string; verification?: string }>;
  omissions?: Array<{ text?: string }>;
  verification?: { verified: number; omitted: number; invalid: number };
}

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
    meshBootstrap: false,
    killSwitch: false,
    ...testReachabilityDefaults({ publicBaseUrl, communityHostMode }),
  };
}

async function reserveLoopbackPort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const address = probe.address();
  if (!address || typeof address === "string") {
    probe.close();
    throw new Error("failed to reserve loopback port");
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const intervalMs = opts.intervalMs ?? 250;
  const label = opts.label ?? "condition";
  const start = Date.now();
  let lastValue: T | undefined;
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      lastValue = value;
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const errPart =
    lastError instanceof Error
      ? lastError.message
      : lastError !== undefined
        ? String(lastError)
        : "none";
  throw new Error(
    `waitFor(${label}) timed out after ${timeoutMs}ms. Last error: ${errPart}. Last value: ${JSON.stringify(lastValue)}`,
  );
}

async function waitForCoffeeShop(hostBase: string): Promise<void> {
  await waitFor(
    () => adminGetJson<{ hosted: Array<{ roomId: string }> }>(hostBase, "/rooms"),
    (rooms) => rooms.hosted.some((room) => room.roomId === COFFEE_SHOP_ROOM_ID),
    { label: "coffee shop room", timeoutMs: 30000 },
  );
}

async function joinMember(memberBase: string, hostBase: string, name: string): Promise<void> {
  await adminPostJson(memberBase, "/rooms/join-remote", {
    hostUrl: hostBase,
    roomId: COFFEE_SHOP_ROOM_ID,
    memberName: name,
  });
}

async function waitForMessageOn(
  base: string,
  text: string,
  opts: { verified?: boolean; label?: string } = {},
): Promise<void> {
  await waitFor(
    () =>
      adminGetJson<MemberMessages>(
        base,
        `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/messages`,
      ),
    (body) => {
      const hit = body.messages.find((m) => m.text === text);
      if (!hit) return false;
      if (opts.verified) return hit.verification === "verified";
      return true;
    },
    { label: opts.label ?? `message "${text}"`, timeoutMs: 30000 },
  );
}

async function startAgent(opts: {
  identityPath: string;
  port: number;
  base: string;
  communityHost: boolean;
}): Promise<Server> {
  process.env.ATOM_AGENT_IDENTITY_PATH = opts.identityPath;
  return startAgentServer({
    config: testConfig(opts.port, opts.base, opts.communityHost),
  });
}

describe("MLS-01 D135 E2E matrix (3 agents)", () => {
  it("N≥3 live fan-out + process restart + decrypt", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-mls01-e2e-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const m1IdentityPath = path.join(root, "m1", "identity.json");
    const m2IdentityPath = path.join(root, "m2", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let m1Server: Server | undefined;
    let m2Server: Server | undefined;

    try {
      const hostPort = await reserveLoopbackPort();
      const m1Port = await reserveLoopbackPort();
      const m2Port = await reserveLoopbackPort();
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const m1Base = `http://127.0.0.1:${m1Port}`;
      const m2Base = `http://127.0.0.1:${m2Port}`;

      await writeIdentityFile(hostIdentityPath);
      await writeIdentityFile(m1IdentityPath);
      await writeIdentityFile(m2IdentityPath);

      hostServer = await startAgent({
        identityPath: hostIdentityPath,
        port: hostPort,
        base: hostBase,
        communityHost: true,
      });
      m1Server = await startAgent({
        identityPath: m1IdentityPath,
        port: m1Port,
        base: m1Base,
        communityHost: false,
      });
      m2Server = await startAgent({
        identityPath: m2IdentityPath,
        port: m2Port,
        base: m2Base,
        communityHost: false,
      });

      await waitForCoffeeShop(hostBase);
      await joinMember(m1Base, hostBase, "Member One");
      await joinMember(m2Base, hostBase, "Member Two");

      const liveText = "mls01-n3-live";
      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: liveText,
      });
      await waitForMessageOn(m1Base, liveText, {
        verified: true,
        label: "m1 decrypt after 2nd join",
      });
      await waitForMessageOn(m2Base, liveText, {
        verified: true,
        label: "m2 decrypt after join",
      });

      await adminPostJson(m1Base, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: "mls01-from-m1",
      });
      await waitForMessageOn(hostBase, "mls01-from-m1", { label: "host sees m1" });

      await adminPostJson(m2Base, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: "mls01-from-m2",
      });
      await waitForMessageOn(hostBase, "mls01-from-m2", { label: "host sees m2" });

      await closeServer(hostServer);
      await closeServer(m1Server);
      await closeServer(m2Server);
      hostServer = undefined;
      m1Server = undefined;
      m2Server = undefined;
      resetRoomChainTrackers();

      // Same ports + identity dirs → load mls-sessions.json / rooms.json.
      hostServer = await startAgent({
        identityPath: hostIdentityPath,
        port: hostPort,
        base: hostBase,
        communityHost: true,
      });
      m1Server = await startAgent({
        identityPath: m1IdentityPath,
        port: m1Port,
        base: m1Base,
        communityHost: false,
      });
      m2Server = await startAgent({
        identityPath: m2IdentityPath,
        port: m2Port,
        base: m2Base,
        communityHost: false,
      });

      const mls = await adminGetJson<{ rooms: string[] }>(hostBase, "/mls/sessions");
      expect(mls.rooms).toContain(COFFEE_SHOP_ROOM_ID);

      const afterRestart = "mls01-after-restart";
      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: afterRestart,
      });
      await waitForMessageOn(m1Base, afterRestart, {
        verified: true,
        label: "m1 after restart",
      });
      await waitForMessageOn(m2Base, afterRestart, {
        verified: true,
        label: "m2 after restart",
      });
    } finally {
      await closeServer(hostServer);
      await closeServer(m1Server);
      await closeServer(m2Server);
      resetRoomChainTrackers();
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 180_000);

  it("remove member + survivors continue after restart", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-mls01-remove-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const m1IdentityPath = path.join(root, "m1", "identity.json");
    const m2IdentityPath = path.join(root, "m2", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let m1Server: Server | undefined;
    let m2Server: Server | undefined;

    try {
      const hostPort = await reserveLoopbackPort();
      const m1Port = await reserveLoopbackPort();
      const m2Port = await reserveLoopbackPort();
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const m1Base = `http://127.0.0.1:${m1Port}`;
      const m2Base = `http://127.0.0.1:${m2Port}`;

      await writeIdentityFile(hostIdentityPath);
      await writeIdentityFile(m1IdentityPath);
      await writeIdentityFile(m2IdentityPath);

      hostServer = await startAgent({
        identityPath: hostIdentityPath,
        port: hostPort,
        base: hostBase,
        communityHost: true,
      });
      m1Server = await startAgent({
        identityPath: m1IdentityPath,
        port: m1Port,
        base: m1Base,
        communityHost: false,
      });
      m2Server = await startAgent({
        identityPath: m2IdentityPath,
        port: m2Port,
        base: m2Base,
        communityHost: false,
      });

      await waitForCoffeeShop(hostBase);
      await joinMember(m1Base, hostBase, "Leaver");
      await joinMember(m2Base, hostBase, "Survivor");

      const beforeLeave = "mls01-before-leave";
      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: beforeLeave,
      });
      await waitForMessageOn(m1Base, beforeLeave, { verified: true });
      await waitForMessageOn(m2Base, beforeLeave, { verified: true });

      await adminPostJson(m1Base, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/leave`, {});

      const members = await adminGetJson<{ members: Array<{ did: string }> }>(
        hostBase,
        `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/members`,
      );
      const m1Did = (await adminGetJson<{ did: string }>(m1Base, "/health")).did;
      expect(members.members.some((m) => m.did === m1Did)).toBe(false);

      const afterRemove = "mls01-after-remove";
      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: afterRemove,
      });
      await waitForMessageOn(m2Base, afterRemove, {
        verified: true,
        label: "survivor after remove",
      });

      await closeServer(hostServer);
      await closeServer(m1Server);
      await closeServer(m2Server);
      hostServer = undefined;
      m1Server = undefined;
      m2Server = undefined;
      resetRoomChainTrackers();

      hostServer = await startAgent({
        identityPath: hostIdentityPath,
        port: hostPort,
        base: hostBase,
        communityHost: true,
      });
      m2Server = await startAgent({
        identityPath: m2IdentityPath,
        port: m2Port,
        base: m2Base,
        communityHost: false,
      });

      const afterRemoveRestart = "mls01-after-remove-restart";
      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: afterRemoveRestart,
      });
      await waitForMessageOn(m2Base, afterRemoveRestart, {
        verified: true,
        label: "survivor after remove+restart",
      });
    } finally {
      await closeServer(hostServer);
      await closeServer(m1Server);
      await closeServer(m2Server);
      resetRoomChainTrackers();
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 180_000);
});
