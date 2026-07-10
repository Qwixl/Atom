import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { listConfiguredConnectorIds } from "./connectorRegistry.js";

async function emptyVault(): Promise<ConnectorVault> {
  const dir = mkdtempSync(path.join(tmpdir(), "atom-connector-registry-"));
  const vault = new ConnectorVault(
    path.join(dir, "vault-master.key"),
    path.join(dir, "vault.enc"),
  );
  await vault.load();
  return vault;
}

describe("listConfiguredConnectorIds", () => {
  it("reports only ephemeral connectors for an empty vault", async () => {
    const vault = await emptyVault();
    const ids = await listConfiguredConnectorIds(vault);
    // news-search, page-fetch, weather need no vault config.
    expect(ids).toEqual(
      expect.arrayContaining(["news-search", "page-fetch", "weather"]),
    );
    expect(ids).not.toContain("webcal");
    expect(ids).not.toContain("todoist");
  });

  it("includes connectors once vault state is configured", async () => {
    const vault = await emptyVault();
    await vault.addWebcalFeed({ label: "Work", url: "https://example.com/cal.ics" });
    await vault.setApiToken("todoist", "secret-token");
    const ids = await listConfiguredConnectorIds(vault);
    expect(ids).toContain("webcal");
    expect(ids).toContain("todoist");
    expect(ids).not.toContain("github");
  });
});
