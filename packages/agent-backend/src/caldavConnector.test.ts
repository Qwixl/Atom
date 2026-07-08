import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { invokeCalDavConnector } from "./caldavConnector.js";

describe("caldavConnector", () => {
  it("getStatus reflects vault accounts without exposing credentials", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-caldav-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addCalDavAccount({
      label: "Work",
      calendarUrl: "https://caldav.example.com/user/work/",
      username: "owner@example.com",
      password: "secret-app-password",
    });

    const result = await invokeCalDavConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({
      connected: true,
      accountCount: 1,
      accounts: [{ label: "Work" }],
    });
    expect(JSON.stringify(result.result)).not.toContain("secret-app-password");
    expect(JSON.stringify(result.result)).not.toContain("caldav.example.com");
  });
});
