import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HandleCacheStore } from "./handleCache.js";

describe("HandleCacheStore", () => {
  it("stores and retrieves handle records", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-handle-cache-"));
    const store = new HandleCacheStore(path.join(dir, "handle-cache.json"));
    store.set(
      "@coffee-shop",
      {
        adminBase: "http://127.0.0.1:5204",
        agentCardUrl: "http://127.0.0.1:5204/a2a/jsonrpc",
        did: "did:key:coffee",
        resolvedVia: "local",
      },
      "coffee-shop.agents.qwixl.dev",
    );
    const cached = store.get("@coffee-shop");
    expect(cached?.did).toBe("did:key:coffee");
    expect(cached?.adminBase).toBe("http://127.0.0.1:5204");
  });
});
