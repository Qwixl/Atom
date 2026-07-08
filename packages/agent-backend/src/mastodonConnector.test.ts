import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import {
  MASTODON_CONNECTOR_ID,
  invokeMastodonConnector,
  normalizeMastodonInstanceUrl,
} from "./mastodonConnector.js";

describe("mastodonConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes instance URL", () => {
    expect(normalizeMastodonInstanceUrl("https://mastodon.social/")).toBe("https://mastodon.social");
  });

  it("getStatus reflects configured instance without exposing secrets", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-masto-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setMastodonInstance("https://mastodon.social", "secret-token");

    const result = await invokeMastodonConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: MASTODON_CONNECTOR_ID });
    expect(JSON.stringify(result.result)).not.toContain("secret-token");
    expect(JSON.stringify(result.result)).not.toContain("mastodon.social");
  });

  it("listHomeTimeline fetches with bearer token", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-masto-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setMastodonInstance("https://mastodon.social", "masto-token");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://mastodon.social/api/v1/timelines/home?limit=10");
      const initHeaders = init?.headers as Record<string, string> | undefined;
      expect(initHeaders?.Authorization).toBe("Bearer masto-token");
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: "1",
              created_at: "2026-07-08T12:00:00.000Z",
              content: "<p>Hello</p>",
              url: "https://mastodon.social/@alice/1",
              visibility: "public",
              account: { username: "alice", display_name: "Alice", acct: "alice@mastodon.social" },
            },
          ]),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeMastodonConnector({ vault }, "listHomeTimeline", { limit: 10 });
    expect(result.result).toMatchObject({
      posts: [{ id: "1", account: { acct: "alice@mastodon.social" } }],
    });
  });
});
