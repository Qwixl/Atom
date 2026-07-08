import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import {
  BLUESKY_CONNECTOR_ID,
  invokeBlueskyConnector,
  normalizeBlueskyPdsUrl,
} from "./blueskyConnector.js";

describe("blueskyConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults PDS URL to bsky.social", () => {
    expect(normalizeBlueskyPdsUrl()).toBe("https://bsky.social");
    expect(normalizeBlueskyPdsUrl("https://custom.example.com/")).toBe("https://custom.example.com");
  });

  it("getStatus reflects vault credentials without exposing secrets", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-bsky-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setBlueskyAccount("user.bsky.social", "app-password-secret");

    const result = await invokeBlueskyConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: BLUESKY_CONNECTOR_ID });
    expect(JSON.stringify(result.result)).not.toContain("app-password-secret");
    expect(JSON.stringify(result.result)).not.toContain("user.bsky.social");
  });

  it("listTimeline creates session then fetches feed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-bsky-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setBlueskyAccount("user.bsky.social", "app-pass");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/xrpc/com.atproto.server.createSession")) {
        expect(init?.method).toBe("POST");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ accessJwt: "jwt-token" }),
        };
      }
      if (url.includes("/xrpc/app.bsky.feed.getTimeline")) {
        expect(url).toContain("limit=5");
        const initHeaders = init?.headers as Record<string, string> | undefined;
        expect(initHeaders?.Authorization).toBe("Bearer jwt-token");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              feed: [
                {
                  post: {
                    uri: "at://did/post/1",
                    author: { handle: "alice.bsky.social", displayName: "Alice" },
                    record: { text: "Hello fediverse", createdAt: "2026-07-08T12:00:00.000Z" },
                  },
                },
              ],
            }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeBlueskyConnector({ vault }, "listTimeline", { limit: 5 });
    expect(result.result).toMatchObject({
      posts: [{ authorHandle: "alice.bsky.social", text: "Hello fediverse" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
