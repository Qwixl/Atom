import type { RegistryCacheSnapshot, RegistryCacheStore, RegistryIndex } from "./types.js";

const CACHE_PREFIX = "atom-registry-cache:";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Browser localStorage cache for index + manifest bytes (bundles re-fetched each session). */
export class LocalStorageRegistryCache implements RegistryCacheStore {
  load(indexUrl: string): RegistryCacheSnapshot | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + indexUrl);
      if (!raw) return null;
      return JSON.parse(raw) as RegistryCacheSnapshot;
    } catch {
      return null;
    }
  }

  save(snapshot: RegistryCacheSnapshot): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CACHE_PREFIX + snapshot.indexUrl, JSON.stringify(snapshot));
    } catch {
      // Best-effort; quota exceeded falls back to network fetch.
    }
  }

  clear(indexUrl?: string): void {
    if (typeof localStorage === "undefined") return;
    if (indexUrl) {
      localStorage.removeItem(CACHE_PREFIX + indexUrl);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  }
}

export function manifestCacheKey(moduleId: string, version: string): string {
  return `${moduleId}@${version}`;
}

export function readCachedManifest(
  cache: RegistryCacheStore,
  indexUrl: string,
  moduleId: string,
  version: string,
  manifestUrl: string,
): Uint8Array | null {
  const snapshot = cache.load(indexUrl);
  if (!snapshot) return null;
  const key = manifestCacheKey(moduleId, version);
  const entry = snapshot.manifests[key];
  if (!entry || entry.manifestUrl !== manifestUrl) return null;
  return base64ToBytes(entry.bytesBase64);
}

export function writeCachedManifest(
  cache: RegistryCacheStore,
  indexUrl: string,
  index: RegistryIndex,
  moduleId: string,
  version: string,
  manifestUrl: string,
  bytes: Uint8Array,
): void {
  const existing = cache.load(indexUrl);
  const snapshot: RegistryCacheSnapshot = existing ?? {
    indexUrl,
    index,
    fetchedAt: Date.now(),
    manifests: {},
  };
  snapshot.index = index;
  snapshot.fetchedAt = Date.now();
  snapshot.manifests[manifestCacheKey(moduleId, version)] = {
    manifestUrl,
    bytesBase64: bytesToBase64(bytes),
    fetchedAt: Date.now(),
  };
  cache.save(snapshot);
}

export function writeCachedIndex(
  cache: RegistryCacheStore,
  indexUrl: string,
  index: RegistryIndex,
): void {
  const existing = cache.load(indexUrl);
  const snapshot: RegistryCacheSnapshot = existing ?? {
    indexUrl,
    index,
    fetchedAt: Date.now(),
    manifests: {},
  };
  snapshot.index = index;
  snapshot.fetchedAt = Date.now();
  cache.save(snapshot);
}
