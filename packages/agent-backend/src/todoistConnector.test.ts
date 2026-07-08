import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import {
  TODOIST_CONNECTOR_ID,
  TODOIST_CONNECTOR_OPERATIONS,
  invokeTodoistConnector,
} from "./todoistConnector.js";

describe("todoistConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares read-only invoke operations", () => {
    const ids = TODOIST_CONNECTOR_OPERATIONS.map((op) => op.id).sort();
    expect(ids).toEqual(["getStatus", "listProjects", "listTasks"]);
  });

  it("getStatus reflects vault token without exposing it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-todoist-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setApiToken(TODOIST_CONNECTOR_ID, "secret-token");

    const result = await invokeTodoistConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: "todoist" });
    expect(JSON.stringify(result.result)).not.toContain("secret-token");
  });

  it("listTasks calls Todoist REST with bearer token", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-todoist-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setApiToken(TODOIST_CONNECTOR_ID, "abc123");

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: "1",
            content: "Ship token connectors",
            priority: 1,
            project_id: "p1",
          },
        ]),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeTodoistConnector({ vault }, "listTasks", { filter: "today" });
    expect(result.result).toMatchObject({
      filter: "today",
      tasks: [{ id: "1", content: "Ship token connectors" }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });
});
