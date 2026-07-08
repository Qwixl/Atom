import type { ConnectorBackend } from "./connectorRegistry.js";
import type { ConnectorVault } from "./connectorVault.js";
import type { ConnectorOperationSpec } from "./webcalConnector.js";
import {
  connectorResultCache,
  resolveOperationCacheTtl,
  stableCacheKey,
  withInvokeMeta,
} from "./connectorCache.js";

export async function invokeConnectorCached(
  backend: ConnectorBackend,
  vault: ConnectorVault,
  connectorId: string,
  operation: string,
  input: Record<string, unknown>,
  operationSpec?: ConnectorOperationSpec,
): Promise<{ operation: string; result: unknown; meta: { fetchedAt: string; cacheHit: boolean; ttlMs: number } }> {
  const ttlMs = resolveOperationCacheTtl(operationSpec);
  const key = stableCacheKey(connectorId, operation, input);
  const now = Date.now();

  if (ttlMs > 0) {
    const cached = connectorResultCache.get(key, ttlMs, now);
    if (cached) {
      const payload = cached.value as { operation: string; result: unknown };
      return withInvokeMeta(payload, { fetchedAtMs: cached.fetchedAtMs, cacheHit: true, ttlMs });
    }
  }

  const raw = await backend.invoke(vault, operation, input);
  const payload =
    raw && typeof raw === "object" && "operation" in raw && "result" in raw
      ? (raw as { operation: string; result: unknown })
      : { operation, result: raw };

  if (ttlMs > 0) {
    connectorResultCache.set(key, payload, now);
  }

  return withInvokeMeta(payload, { fetchedAtMs: now, cacheHit: false, ttlMs });
}

export function invalidateConnectorCache(connectorId: string): void {
  connectorResultCache.invalidateConnector(connectorId);
}
