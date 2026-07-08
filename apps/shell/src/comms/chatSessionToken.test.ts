import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getChatSessionToken,
  refreshChatSessionToken,
  setChatSessionToken,
} from "./chatSessionToken.js";

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

  it("refreshChatSessionToken mints and stores a new token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ token: "session-read-1" }),
      })),
    );
    const token = await refreshChatSessionToken({
      adminUrl: "http://127.0.0.1:5204",
      adminToken: "admin-secret",
    });
    expect(token).toBe("session-read-1");
    expect(getChatSessionToken()).toBe("session-read-1");
  });
});
