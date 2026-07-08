import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { LINEAR_CONNECTOR_ID, invokeLinearConnector } from "./linearConnector.js";

describe("linearConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStatus reflects vault token without exposing it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-linear-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setApiToken(LINEAR_CONNECTOR_ID, "lin_api_secret");

    const result = await invokeLinearConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: "linear" });
    expect(JSON.stringify(result.result)).not.toContain("lin_api_secret");
  });

  it("listAssignedIssues posts GraphQL with API key authorization", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-linear-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setApiToken(LINEAR_CONNECTOR_ID, "lin_api_abc");

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            viewer: {
              assignedIssues: {
                nodes: [{ id: "1", identifier: "AT-1", title: "Ship Linear connector", state: { name: "In Progress" } }],
              },
            },
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLinearConnector({ vault }, "listAssignedIssues", { limit: 5 });
    expect(result.result).toMatchObject({
      issues: [{ identifier: "AT-1", title: "Ship Linear connector", state: "In Progress" }],
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("lin_api_abc");
  });
});
