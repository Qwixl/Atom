import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CHAT_SESSION_SCOPES,
  getChatSessionToken,
  refreshChatSessionToken,
  setChatSessionToken,
} from "./chatSessionToken.js";

vi.mock("../hostConfig.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hostConfig.js")>();
  return { ...actual, usesSupabaseHostedAuth: () => false };
});

describe("chatSessionToken", () => {
  beforeEach(() => {
    setChatSessionToken(null);
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
});
