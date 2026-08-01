import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { bytesToBase64, generateAgentKeyPair } from "@qwixl/protocol";
import { startAgentServer } from "./server.js";
import type { AgentBackendConfig } from "./config.js";
import { testReachabilityDefaults } from "./config.js";
import { COFFEE_SHOP_ROOM_ID } from "./communityCoffeeShop.js";
import { resetRoomChainTrackers } from "./roomsAdmin.js";
import { adminGetJson, adminPostJson, installTestAdminToken } from "./testHelpers.js";

interface VerificationSummary {
  verified: number;
  legacy: number;
  unsigned: number;
  invalid: number;
  substituted: number;
  omitted: number;
}

interface MemberVerification {
  role: "member";
  summary: VerificationSummary;
  omissions: Array<{ text?: string }>;
  forks: Array<unknown>;
}

interface MemberMessages {
  messages: Array<{ text?: string; verification?: string }>;
  omissions?: Array<{ text?: string }>;
  verification?: VerificationSummary;
}

type TamperMode = "none" | "substitute" | "omit";

interface TamperConfig {
  mode: TamperMode;
  roomId: string;
  /** Message text to omit (omit mode) or first message with text to substitute. */
  targetText?: string;
  substituteText?: string;
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

/** Bind port 0 so Windows Hyper-V excluded ranges cannot EACCES a hard-coded port. */
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

async function listenEphemeral(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind ephemeral port");
  }
  return address.port;
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
  const timeoutMs = opts.timeoutMs ?? 15000;
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

function messagesPathRoomId(pathname: string): string | undefined {
  const match = pathname.match(/^\/rooms\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function tamperMessagesResponse(body: Buffer, config: TamperConfig): Buffer {
  if (config.mode === "none") return body;
  try {
    const json = JSON.parse(body.toString("utf8")) as {
      messages?: Array<{ text?: string }>;
    };
    if (!json.messages?.length) return body;
    if (config.mode === "substitute") {
      for (const message of json.messages) {
        if (message.text && (config.targetText === undefined || message.text === config.targetText)) {
          message.text = config.substituteText ?? "tampered by host";
          break;
        }
      }
    } else if (config.mode === "omit" && config.targetText) {
      json.messages = json.messages.filter((message) => message.text !== config.targetText);
    }
    return Buffer.from(JSON.stringify(json));
  } catch {
    return body;
  }
}

function forwardToHost(
  clientReq: IncomingMessage,
  clientRes: ServerResponse,
  hostBase: string,
  tamper: () => TamperConfig,
): void {
  const target = new URL(hostBase);
  const requestUrl = new URL(clientReq.url ?? "/", hostBase);
  const chunks: Buffer[] = [];
  clientReq.on("data", (chunk) => chunks.push(chunk as Buffer));
  clientReq.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = { ...clientReq.headers, host: target.host };
    const proxyReq = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: clientReq.method,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        headers,
      },
      (proxyRes) => {
        const responseChunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => responseChunks.push(chunk as Buffer));
        proxyRes.on("end", () => {
          let outBody = Buffer.concat(responseChunks);
          const pathRoomId = messagesPathRoomId(requestUrl.pathname);
          const config = tamper();
          if (pathRoomId && pathRoomId === config.roomId) {
            outBody = Buffer.from(tamperMessagesResponse(outBody, config));
          }
          const outHeaders = { ...proxyRes.headers };
          delete outHeaders["content-length"];
          delete outHeaders["transfer-encoding"];
          clientRes.writeHead(proxyRes.statusCode ?? 500, outHeaders);
          clientRes.end(outBody);
        });
      },
    );
    proxyReq.on("error", (error) => {
      clientRes.writeHead(502);
      clientRes.end(error instanceof Error ? error.message : String(error));
    });
    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

function createTamperingProxy(hostBase: string, tamperState: { current: TamperConfig }): Server {
  return createServer((clientReq, clientRes) => {
    forwardToHost(clientReq, clientRes, hostBase, () => tamperState.current);
  });
}

async function waitForCoffeeShop(hostBase: string): Promise<void> {
  await waitFor(
    () => adminGetJson<{ hosted: Array<{ roomId: string }> }>(hostBase, "/rooms"),
    (rooms) => rooms.hosted.some((room) => room.roomId === COFFEE_SHOP_ROOM_ID),
    { label: "coffee shop room", timeoutMs: 30000 },
  );
}

/**
 * A host must be able to post in a room it created without self-joining first.
 * Asserted rather than worked around: the roster is what `/send` gates on, so a
 * host missing from it is locked out of its own room.
 */
async function assertHostCanSend(hostBase: string, roomId: string): Promise<void> {
  const health = await adminGetJson<{ did: string }>(hostBase, "/health");
  const members = await adminGetJson<{ members: Array<{ did: string }> }>(
    hostBase,
    `/rooms/${encodeURIComponent(roomId)}/members`,
  );
  expect(members.members.some((m) => m.did === health.did)).toBe(true);
}

async function joinMemberToHost(memberBase: string, hostUrl: string): Promise<void> {
  await adminPostJson(memberBase, "/rooms/join-remote", {
    hostUrl,
    roomId: COFFEE_SHOP_ROOM_ID,
    memberName: "Integrity test member",
  });
}

async function waitForMemberVerified(memberBase: string): Promise<MemberVerification> {
  return waitFor(
    () =>
      adminGetJson<MemberVerification>(
        memberBase,
        `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/verification`,
      ),
    (verification) =>
      verification.role === "member" &&
      verification.summary.verified >= 1 &&
      verification.summary.invalid === 0 &&
      verification.summary.substituted === 0 &&
      verification.summary.omitted === 0 &&
      verification.forks.length === 0,
    { label: "member verification clean", timeoutMs: 30000 },
  );
}

describe("room message integrity (E2E)", () => {
  it("host to member fan-out produces a verified member transcript", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-rooms-integrity-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const memberIdentityPath = path.join(root, "member", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let memberServer: Server | undefined;

    const messageText = "integrity e2e host fan-out";

    try {
      const hostPort = await reserveLoopbackPort();
      const memberPort = await reserveLoopbackPort();
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const memberBase = `http://127.0.0.1:${memberPort}`;

      process.env.ATOM_AGENT_IDENTITY_PATH = hostIdentityPath;
      await writeIdentityFile(hostIdentityPath);

      hostServer = await startAgentServer({
        config: testConfig(hostPort, hostBase, true),
      });

      process.env.ATOM_AGENT_IDENTITY_PATH = memberIdentityPath;
      await writeIdentityFile(memberIdentityPath);

      memberServer = await startAgentServer({
        config: testConfig(memberPort, memberBase, false),
      });

      await waitForCoffeeShop(hostBase);
      await assertHostCanSend(hostBase, COFFEE_SHOP_ROOM_ID);

      await joinMemberToHost(memberBase, hostBase);

      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: messageText,
      });

      const verification = await waitForMemberVerified(memberBase);
      expect(verification.summary.verified).toBeGreaterThanOrEqual(1);
      expect(verification.summary.invalid).toBe(0);
      expect(verification.summary.substituted).toBe(0);
      expect(verification.summary.unsigned).toBe(0);
      expect(verification.summary.omitted).toBe(0);
      expect(verification.forks).toHaveLength(0);

      const messages = await adminGetJson<MemberMessages>(
        memberBase,
        `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/messages`,
      );
      const hostMessage = messages.messages.find((msg) => msg.text === messageText);
      expect(hostMessage).toBeDefined();
      expect(hostMessage?.verification).toBe("verified");

      // No admin route exposes listJoinedMessages; summary.omitted === 0 while the
      // host serves this message is indirect evidence the member stored its own copy.
    } finally {
      await closeServer(hostServer);
      await closeServer(memberServer);
      resetRoomChainTrackers();
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 120_000);

  it("catches a host that rewrites message text", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-rooms-integrity-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const memberIdentityPath = path.join(root, "member", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let memberServer: Server | undefined;
    let proxyServer: Server | undefined;

    const messageText = "integrity e2e substitute target";
    const tamperedText = "tampered by host";
    const tamperState: { current: TamperConfig } = {
      current: { mode: "none", roomId: COFFEE_SHOP_ROOM_ID },
    };

    try {
      process.env.ATOM_AGENT_IDENTITY_PATH = hostIdentityPath;
      await writeIdentityFile(hostIdentityPath);

      const hostPort = await reserveLoopbackPort();
      const memberPort = await reserveLoopbackPort();
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const memberBase = `http://127.0.0.1:${memberPort}`;

      hostServer = await startAgentServer({
        config: testConfig(hostPort, hostBase, true),
      });

      proxyServer = createTamperingProxy(hostBase, tamperState);
      const proxyPort = await listenEphemeral(proxyServer);
      const proxyBase = `http://127.0.0.1:${proxyPort}`;

      process.env.ATOM_AGENT_IDENTITY_PATH = memberIdentityPath;
      await writeIdentityFile(memberIdentityPath);
      memberServer = await startAgentServer({
        config: testConfig(memberPort, memberBase, false),
      });

      await waitForCoffeeShop(hostBase);
      await assertHostCanSend(hostBase, COFFEE_SHOP_ROOM_ID);

      await joinMemberToHost(memberBase, proxyBase);

      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: messageText,
      });

      await waitForMemberVerified(memberBase);

      tamperState.current = {
        mode: "substitute",
        roomId: COFFEE_SHOP_ROOM_ID,
        targetText: messageText,
        substituteText: tamperedText,
      };

      const messages = await waitFor(
        () =>
          adminGetJson<MemberMessages>(
            memberBase,
            `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/messages`,
          ),
        (body) =>
          body.messages.some(
            (msg) => msg.text === messageText && msg.verification === "substituted",
          ),
        { label: "substituted message", timeoutMs: 15000 },
      );

      const substituted = messages.messages.find((msg) => msg.text === messageText);
      expect(substituted?.verification).toBe("substituted");
      expect(substituted?.text).toBe(messageText);
      expect(substituted?.text).not.toBe(tamperedText);

      const verification = await waitFor(
        () =>
          adminGetJson<MemberVerification>(
            memberBase,
            `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/verification`,
          ),
        (body) => body.summary.substituted >= 1,
        { label: "substituted summary", timeoutMs: 15000 },
      );
      expect(verification.summary.substituted).toBeGreaterThanOrEqual(1);
    } finally {
      await closeServer(proxyServer);
      await closeServer(hostServer);
      await closeServer(memberServer);
      resetRoomChainTrackers();
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 120_000);

  it("catches a host that withholds a message", async () => {
    const restoreToken = installTestAdminToken();
    const root = await mkdtemp(path.join(tmpdir(), "atom-rooms-integrity-"));
    const hostIdentityPath = path.join(root, "host", "identity.json");
    const memberIdentityPath = path.join(root, "member", "identity.json");
    const prevIdentityPath = process.env.ATOM_AGENT_IDENTITY_PATH;

    let hostServer: Server | undefined;
    let memberServer: Server | undefined;
    let proxyServer: Server | undefined;

    const messageText = "integrity e2e omission target";
    const tamperState: { current: TamperConfig } = {
      current: { mode: "none", roomId: COFFEE_SHOP_ROOM_ID },
    };

    try {
      process.env.ATOM_AGENT_IDENTITY_PATH = hostIdentityPath;
      await writeIdentityFile(hostIdentityPath);

      const hostPort = await reserveLoopbackPort();
      const memberPort = await reserveLoopbackPort();
      const hostBase = `http://127.0.0.1:${hostPort}`;
      const memberBase = `http://127.0.0.1:${memberPort}`;

      hostServer = await startAgentServer({
        config: testConfig(hostPort, hostBase, true),
      });

      proxyServer = createTamperingProxy(hostBase, tamperState);
      const proxyPort = await listenEphemeral(proxyServer);
      const proxyBase = `http://127.0.0.1:${proxyPort}`;

      process.env.ATOM_AGENT_IDENTITY_PATH = memberIdentityPath;
      await writeIdentityFile(memberIdentityPath);
      memberServer = await startAgentServer({
        config: testConfig(memberPort, memberBase, false),
      });

      await waitForCoffeeShop(hostBase);
      await assertHostCanSend(hostBase, COFFEE_SHOP_ROOM_ID);

      await joinMemberToHost(memberBase, proxyBase);

      await adminPostJson(hostBase, `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/send`, {
        text: messageText,
      });

      await waitForMemberVerified(memberBase);

      tamperState.current = {
        mode: "omit",
        roomId: COFFEE_SHOP_ROOM_ID,
        targetText: messageText,
      };

      const verification = await waitFor(
        () =>
          adminGetJson<MemberVerification>(
            memberBase,
            `/rooms/${encodeURIComponent(COFFEE_SHOP_ROOM_ID)}/verification`,
          ),
        (body) =>
          body.summary.omitted >= 1 &&
          body.omissions.some((entry) => entry.text === messageText),
        { label: "omitted verification", timeoutMs: 15000 },
      );

      expect(verification.summary.omitted).toBeGreaterThanOrEqual(1);
      expect(verification.omissions.some((entry) => entry.text === messageText)).toBe(true);
    } finally {
      await closeServer(proxyServer);
      await closeServer(hostServer);
      await closeServer(memberServer);
      resetRoomChainTrackers();
      if (prevIdentityPath === undefined) delete process.env.ATOM_AGENT_IDENTITY_PATH;
      else process.env.ATOM_AGENT_IDENTITY_PATH = prevIdentityPath;
      restoreToken();
    }
  }, 120_000);
});
