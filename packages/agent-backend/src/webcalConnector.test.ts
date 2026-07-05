import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import {
  WEBCAL_CONNECTOR_OPERATIONS,
  connectorOperation,
  invokeWebcalConnector,
} from "./webcalConnector.js";

describe("webcalConnector", () => {
  it("declares read-only operations matching manifest", () => {
    const ids = WEBCAL_CONNECTOR_OPERATIONS.map((op) => op.id).sort();
    expect(ids).toEqual(["getStatus", "listEvents"]);
    expect(connectorOperation("createEvent")).toBeUndefined();
  });

  it("getStatus reflects vault feeds without exposing URLs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-webcal-test-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    await vault.addWebcalFeed({
      label: "Work",
      url: "https://example.com/work.ics",
    });

    const result = await invokeWebcalConnector({ vault }, "getStatus", {});
    expect(result.result).toMatchObject({
      connected: true,
      feedCount: 1,
      feeds: [{ label: "Work" }],
    });
    const feeds = (result.result as { feeds: Array<{ url?: string }> }).feeds;
    expect(feeds[0]?.url).toBeUndefined();
  });
});
