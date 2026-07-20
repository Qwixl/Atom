import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CHAT_SESSION_SCOPES,
  getChatSessionToken,
  mintChatSessionToken,
  refreshChatSessionToken,
  setChatSessionToken,
} from "./chatSessionToken.js";

const hostedAuth = vi.hoisted(() => ({ enabled: false }));

vi.mock("../hostConfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hostConfig.js")>();
  return { ...actual, usesSupabaseHostedAuth: () => hostedAuth.enabled };
});

vi.mock("./hostedAgentSession.js", () => ({
  mintHostedAgentSession: vi.fn(async () => null),
}));

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
        body: JSON.stringify({ scopes: [...CHAT_SESSION_SCOPES], ttlSeconds: 900 }),
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
});
