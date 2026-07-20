import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CHAT_SESSION_SCOPES,
  CHAT_SESSION_TTL_SECONDS,
  chatSessionNeedsRefresh,
  getChatSessionToken,
  mintChatSessionToken,
  peekChatSessionExpiryMs,
  refreshChatSessionToken,
  remintChatSessionToken,
  setChatSessionToken,
  subscribeChatSessionToken,
} from "./chatSessionToken.js";

const hostedAuth = vi.hoisted(() => ({ enabled: false }));

vi.mock("../hostConfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hostConfig.js")>();
  return { ...actual, usesSupabaseHostedAuth: () => hostedAuth.enabled };
});

vi.mock("./hostedAgentSession.js", () => ({
  mintHostedAgentSession: vi.fn(async () => null),
}));

function mintTestToken(expMs: number): string {
  const body = Buffer.from(JSON.stringify({ v: 1, exp: expMs, scopes: ["owner:runtime"] })).toString(
    "base64url",
  );
  return `atom.st1.${body}.fakesig`;
}

describe("chatSessionToken", () => {
  beforeEach(() => {
    setChatSessionToken(null);
    hostedAuth.enabled = false;
    vi.unstubAllGlobals();
  });

  it("stores and clears the in-memory session token", () => {
    setChatSessionToken("abc");
    expect(getChatSessionToken()).toBe("abc");
    setChatSessionToken(null);
    expect(getChatSessionToken()).toBeNull();
  });

  it("notifies subscribers when the token changes", () => {
    const seen: Array<string | null> = [];
    const unsubscribe = subscribeChatSessionToken((token) => seen.push(token));
    setChatSessionToken("one");
    setChatSessionToken("two");
    unsubscribe();
    setChatSessionToken("three");
    expect(seen).toEqual(["one", "two"]);
  });

  it("peekChatSessionExpiryMs reads exp from atom.st1 payloads", () => {
    const exp = Date.now() + 60_000;
    expect(peekChatSessionExpiryMs(mintTestToken(exp))).toBe(exp);
    expect(peekChatSessionExpiryMs("not-a-session")).toBeNull();
  });

  it("chatSessionNeedsRefresh is true near expiry", () => {
    const soon = mintTestToken(Date.now() + 30_000);
    const later = mintTestToken(Date.now() + 10 * 60_000);
    expect(chatSessionNeedsRefresh(soon)).toBe(true);
    expect(chatSessionNeedsRefresh(later)).toBe(false);
    expect(chatSessionNeedsRefresh(null)).toBe(true);
  });

  it("refreshChatSessionToken mints connector:read + chat:agui and stores the token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: "session-read-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const token = await refreshChatSessionToken({
      adminUrl: "http://127.0.0.1:5204",
      adminToken: "admin-secret",
    });
    expect(token).toBe("session-read-1");
    expect(getChatSessionToken()).toBe("session-read-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5204/admin/session-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scopes: [...CHAT_SESSION_SCOPES], ttlSeconds: CHAT_SESSION_TTL_SECONDS }),
      }),
    );
  });

  it("hosted mint failure does not fall back to agent /admin/session-token", async () => {
    hostedAuth.enabled = true;
    const { mintHostedAgentSession } = await import("./hostedAgentSession.js");
    vi.mocked(mintHostedAgentSession).mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token = await mintChatSessionToken({
      adminUrl: "https://5311.agents.atom.qwixl.com",
      adminToken: "admin-secret",
    });
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshChatSessionToken keeps prior token when remint fails", async () => {
    hostedAuth.enabled = true;
    setChatSessionToken("keep-me");
    const { mintHostedAgentSession } = await import("./hostedAgentSession.js");
    vi.mocked(mintHostedAgentSession).mockResolvedValueOnce(null);
    const token = await refreshChatSessionToken({
      adminUrl: "https://5311.agents.atom.qwixl.com",
    });
    expect(token).toBe("keep-me");
    expect(getChatSessionToken()).toBe("keep-me");
  });

  it("remintChatSessionToken returns null instead of keeping a stale bearer", async () => {
    hostedAuth.enabled = true;
    setChatSessionToken("stale");
    const { mintHostedAgentSession } = await import("./hostedAgentSession.js");
    vi.mocked(mintHostedAgentSession).mockResolvedValueOnce(null);
    const token = await remintChatSessionToken({
      adminUrl: "https://5311.agents.atom.qwixl.com",
    });
    expect(token).toBeNull();
    expect(getChatSessionToken()).toBe("stale");
  });
});
