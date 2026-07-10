import { describe, expect, it, vi, afterEach } from "vitest";
import { invokePageFetchConnector, PAGE_FETCH_CONNECTOR_ID } from "./pageFetchConnector.js";
import type { ConnectorVault } from "./connectorVault.js";

describe("pageFetchConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads public https pages as plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: null,
        text: async () => "<html><body><h1>Reform donations</h1><p>Police are investigating.</p></body></html>",
      })),
    );
    const result = await invokePageFetchConnector(
      { vault: {} as ConnectorVault },
      "readPage",
      { url: "https://www.bbc.co.uk/news/example" },
    );
    expect(result.operation).toBe("readPage");
    const body = result.result as { url: string; text: string; source: string };
    expect(body.url).toBe("https://www.bbc.co.uk/news/example");
    expect(body.source).toBe(PAGE_FETCH_CONNECTOR_ID);
    expect(body.text).toContain("Reform donations");
    expect(body.text).toContain("Police are investigating");
  });

  it("rejects missing url", async () => {
    await expect(
      invokePageFetchConnector({ vault: {} as ConnectorVault }, "readPage", {}),
    ).rejects.toThrow(/url required/);
  });

  it("rejects private hosts", async () => {
    await expect(
      invokePageFetchConnector(
        { vault: {} as ConnectorVault },
        "readPage",
        { url: "https://127.0.0.1/secret" },
      ),
    ).rejects.toThrow(/Private/);
  });
});
