import { describe, expect, it, beforeEach } from "vitest";
import {
  ConnectorResultCache,
  DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  resolveOperationCacheTtl,
  stableCacheKey,
} from "./connectorCache.js";

describe("connectorCache", () => {
  let cache: ConnectorResultCache;

  beforeEach(() => {
    cache = new ConnectorResultCache();
  });

  it("returns cached value within TTL", () => {
    const key = stableCacheKey("webcal", "listEvents", { timeMin: "a", timeMax: "b" });
    cache.set(key, { events: [] }, 1000);
    const hit = cache.get(key, 5000, 2000);
    expect(hit?.value).toEqual({ events: [] });
  });

  it("expires after TTL", () => {
    const key = "webcal:listEvents:{}";
    cache.set(key, { ok: true }, 0);
    expect(cache.get(key, 100, 200)).toBeUndefined();
  });

  it("invalidates by connector id prefix", () => {
    cache.set("webcal:a:{}", { a: 1 }, 0);
    cache.set("webcal:b:{}", { b: 2 }, 0);
    cache.set("other:c:{}", { c: 3 }, 0);
    cache.invalidateConnector("webcal");
    expect(cache.get("webcal:a:{}", 60_000, 1000)).toBeUndefined();
    expect(cache.get("other:c:{}", 60_000, 1000)).toBeDefined();
  });

  it("caps manifest TTL and skips write ops", () => {
    expect(resolveOperationCacheTtl({ permission: "write", cacheTtlMs: 999_999 })).toBe(0);
    expect(
      resolveOperationCacheTtl({ permission: "read", cacheTtlMs: 999_999 }),
    ).toBeLessThan(999_999);
    expect(resolveOperationCacheTtl({ permission: "read" })).toBe(
      DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
    );
  });
});
