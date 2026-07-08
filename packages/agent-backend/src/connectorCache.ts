/** Lazy read cache for connector invoke — external fetches only when stale. */

export interface ConnectorCacheEntry {
  value: unknown;
  fetchedAtMs: number;
}

export interface ConnectorInvokeMeta {
  fetchedAt: string;
  cacheHit: boolean;
  ttlMs: number;
}

export function stableCacheKey(
  connectorId: string,
  operation: string,
  input: Record<string, unknown>,
): string {
  const sorted = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});
  return `${connectorId}:${operation}:${JSON.stringify(sorted)}`;
}

export class ConnectorResultCache {
  private entries = new Map<string, ConnectorCacheEntry>();

  get(key: string, ttlMs: number, now = Date.now()): ConnectorCacheEntry | undefined {
    if (ttlMs <= 0) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.fetchedAtMs > ttlMs) return undefined;
    return entry;
  }

  set(key: string, value: unknown, now = Date.now()): ConnectorCacheEntry {
    const entry = { value, fetchedAtMs: now };
    this.entries.set(key, entry);
    return entry;
  }

  invalidateConnector(connectorId: string): void {
    const prefix = `${connectorId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Shared process cache — one per agent backend instance. */
export const connectorResultCache = new ConnectorResultCache();

export function resetConnectorResultCacheForTests(): void {
  connectorResultCache.clear();
}

export const DEFAULT_CONNECTOR_READ_CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_CONNECTOR_CACHE_TTL_MS = 15 * 60 * 1000;

export function resolveOperationCacheTtl(spec?: {
  permission?: string;
  cacheTtlMs?: number;
}): number {
  if (!spec || spec.permission === "write") return 0;
  const requested = spec.cacheTtlMs ?? DEFAULT_CONNECTOR_READ_CACHE_TTL_MS;
  return Math.min(Math.max(0, requested), MAX_CONNECTOR_CACHE_TTL_MS);
}

export function withInvokeMeta(
  payload: { operation: string; result: unknown },
  meta: Omit<ConnectorInvokeMeta, "fetchedAt"> & { fetchedAtMs: number },
): { operation: string; result: unknown; meta: ConnectorInvokeMeta } {
  return {
    ...payload,
    meta: {
      fetchedAt: new Date(meta.fetchedAtMs).toISOString(),
      cacheHit: meta.cacheHit,
      ttlMs: meta.ttlMs,
    },
  };
}
