import type { SecretRef, SecretStore } from "./types.js";
import { createMemorySecretStore } from "./memorySecretStore.js";
import { createLayeredSecretStore } from "./defaultSecretStore.js";

/**
 * Production hosts: secrets live in memory for the session only.
 * Optional host adapter (OS keychain / server proxy) overlays reads.
 */
export function createProductionSecretStore(host?: SecretStore): SecretStore {
  const session = createMemorySecretStore();
  if (!host) return session;
  return createLayeredSecretStore(session, host);
}

const STORAGE_PREFIX = "atom-secret:";

/** Remove legacy localStorage credentials on production startup. */
export function purgeInsecureLocalCredentials(connectionConfigKey: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(connectionConfigKey);
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Best-effort purge.
  }
}

export function listInsecureCredentialKeys(): SecretRef[] {
  if (typeof localStorage === "undefined") return [];
  const refs: SecretRef[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) refs.push(key.slice(STORAGE_PREFIX.length));
    }
  } catch {
    return [];
  }
  return refs;
}
