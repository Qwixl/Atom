import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { RSS_CONNECTOR_OPERATIONS, invokeRssConnector, rssConnectorOperation } from "./rssConnector.js";

describe("rssConnector", () => {
  it("declares read-only operations", () => {
    const ids = RSS_CONNECTOR_OPERATIONS.map((op) => op.id).sort();
    expect(ids).toEqual(["getStatus", "listItems"]);
    expect(rssConnectorOperation("writeItem")).toBeUndefined();
  });

  it("getStatus reflects vault feeds without exposing URLs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-rss-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addRssFeed({
      label: "News",
      url: "https://example.com/feed.xml",
    });

    const result = await invokeRssConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({
      connected: true,
      feedCount: 1,
      feeds: [{ label: "News" }],
    });
    const feeds = (result.result as { feeds: Array<{ url?: string }> }).feeds;
    expect(feeds[0]?.url).toBeUndefined();
  });
});
