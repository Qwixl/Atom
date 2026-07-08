import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { invokeHomeAssistantConnector, normalizeHomeAssistantBaseUrl } from "./homeAssistantConnector.js";

describe("homeAssistantConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes base URL", () => {
    expect(normalizeHomeAssistantBaseUrl("https://ha.example.com/")).toBe("https://ha.example.com");
  });

  it("getStatus reflects configured instance without exposing secrets", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ha-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setHomeAssistantInstance("https://ha.example.com", "secret-token");

    const result = await invokeHomeAssistantConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: "home-assistant" });
    expect(JSON.stringify(result.result)).not.toContain("secret-token");
    expect(JSON.stringify(result.result)).not.toContain("ha.example.com");
  });

  it("listEntities filters by domain", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ha-fetch-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.setHomeAssistantInstance("https://ha.example.com", "abc123");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen" } },
          { entity_id: "sensor.temp", state: "21", attributes: { friendly_name: "Temp" } },
        ]),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeHomeAssistantConnector({ vault }, "listEntities", { domain: "light" });
    expect(result.result).toMatchObject({
      domain: "light",
      entities: [{ entityId: "light.kitchen", state: "on", friendlyName: "Kitchen" }],
    });
  });
});
