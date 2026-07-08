import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ConnectorBackend } from "./connectorRegistry.js";
import type { ConnectorVault } from "./connectorVault.js";
import { resetConnectorResultCacheForTests } from "./connectorCache.js";
import { invokeConnectorCached } from "./connectorInvoke.js";

describe("invokeConnectorCached", () => {
  const vault = {} as ConnectorVault;

  beforeEach(() => {
    resetConnectorResultCacheForTests();
  });

  it("returns cache hit on second read within TTL", async () => {
    const invoke = vi.fn(async () => ({ operation: "read", result: { ok: true } }));
    const backend: ConnectorBackend = {
      id: "test",
      moduleId: "test",
      provider: "test",
      label: "Test",
      status: async () => ({}),
      invoke,
      operationSpec: () => ({ id: "read", permission: "read", description: "", cacheTtlMs: 60_000 }),
    };

    const first = await invokeConnectorCached(backend, vault, "test", "read", {}, backend.operationSpec!("read"));
    const second = await invokeConnectorCached(backend, vault, "test", "read", {}, backend.operationSpec!("read"));

    expect(first.meta.cacheHit).toBe(false);
    expect(second.meta.cacheHit).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not cache write operations", async () => {
    const invoke = vi.fn(async () => ({ operation: "write", result: { ok: true } }));
    const backend: ConnectorBackend = {
      id: "test",
      moduleId: "test",
      provider: "test",
      label: "Test",
      status: async () => ({}),
      invoke,
      operationSpec: () => ({ id: "write", permission: "write", description: "" }),
    };

    await invokeConnectorCached(backend, vault, "test", "write", {}, backend.operationSpec!("write"));
    await invokeConnectorCached(backend, vault, "test", "write", {}, backend.operationSpec!("write"));

    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
