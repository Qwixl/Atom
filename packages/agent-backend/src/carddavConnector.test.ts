import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { invokeCardDavConnector } from "./carddavConnector.js";

describe("carddavConnector", () => {
  it("getStatus returns labels without credentials", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-carddav-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addCardDavAccount({
      label: "Personal",
      addressBookUrl: "https://carddav.example.com/user/default/",
      username: "user@example.com",
      password: "secret",
    });

    const result = await invokeCardDavConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({
      connected: true,
      accountCount: 1,
      accounts: [{ label: "Personal" }],
      provider: "carddav",
    });
    expect(JSON.stringify(result.result)).not.toContain("secret");
    expect(JSON.stringify(result.result)).not.toContain("carddav.example.com");
  });
});
