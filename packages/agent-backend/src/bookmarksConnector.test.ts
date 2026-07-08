import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import {
  BOOKMARKS_CONNECTOR_OPERATIONS,
  bookmarksConnectorOperation,
  invokeBookmarksConnector,
} from "./bookmarksConnector.js";

describe("bookmarksConnector", () => {
  it("declares read-only operations", () => {
    const ids = BOOKMARKS_CONNECTOR_OPERATIONS.map((op) => op.id).sort();
    expect(ids).toEqual(["getStatus", "listBookmarks", "readBookmark"]);
    expect(bookmarksConnectorOperation("writeBookmark")).toBeUndefined();
  });

  it("getStatus reflects vault bookmarks without exposing URLs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-atom-bookmarks-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addBookmark({
      label: "Docs",
      url: "https://example.com/docs",
    });

    const result = await invokeBookmarksConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({
      connected: true,
      bookmarkCount: 1,
      bookmarks: [{ label: "Docs" }],
    });
    const bookmarks = (result.result as { bookmarks: Array<{ url?: string }> }).bookmarks;
    expect(bookmarks[0]?.url).toBeUndefined();
  });
});
