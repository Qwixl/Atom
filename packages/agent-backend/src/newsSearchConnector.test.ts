import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { invokeNewsSearchConnector } from "./newsSearchConnector.js";

describe("newsSearchConnector", () => {
  it("requires query for searchItems", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-news-search-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await expect(invokeNewsSearchConnector({ vault }, "searchItems", {})).rejects.toThrow(/query required/);
  });
});
