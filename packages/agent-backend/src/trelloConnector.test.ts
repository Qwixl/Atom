import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { invokeTrelloConnector } from "./trelloConnector.js";

describe("trelloConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStatus reflects configured credentials without exposing them", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-trello-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setTrelloCredentials("api-key", "user-token");

    const result = await invokeTrelloConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: "trello" });
    expect(JSON.stringify(result.result)).not.toContain("api-key");
    expect(JSON.stringify(result.result)).not.toContain("user-token");
  });

  it("listBoards calls Trello REST with key and token query params", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-trello-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setTrelloCredentials("key123", "token456");

    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: "b1", name: "Roadmap", url: "https://trello.com/b/1", closed: false }]),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeTrelloConnector({ vault }, "listBoards", {});
    expect(result.result).toMatchObject({ boards: [{ id: "b1", name: "Roadmap" }] });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("key=key123");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("token=token456");
  });
});
