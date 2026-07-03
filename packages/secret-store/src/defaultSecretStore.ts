import type { SecretRef, SecretStore } from "./types.js";
import { createLocalStorageSecretStore } from "./localStorageSecretStore.js";
import { createMemorySecretStore } from "./memorySecretStore.js";

export type SecretStoreBackend = "auto" | "memory" | "localStorage";

export interface DefaultSecretStoreOptions {
  /** `auto`: host inject → localStorage (browser) or memory (non-browser). */
  backend?: SecretStoreBackend;
  /** Host-provided backend (OS keychain proxy, server-side vault, etc.). Highest read priority. */
  host?: SecretStore;
  /** Seed values when using the memory backend. */
  memorySeed?: Record<SecretRef, string>;
}

declare global {
  interface Window {
    __QWIXL_SECRET_STORE__?: SecretStore;
  }
}

function readInjectedHostStore(): SecretStore | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const injected =
    typeof window !== "undefined" ? window.__QWIXL_SECRET_STORE__ : undefined;
  return injected;
}

/**
 * Read priority: overlays first, then primary. Writes and deletes go to primary
 * only; overlays are read-through caches or host-provided overrides.
 */
export function createLayeredSecretStore(
  primary: SecretStore,
  ...overlays: SecretStore[]
): SecretStore {
  return {
    get(ref: SecretRef): string | null {
      for (const store of overlays) {
        const value = store.get(ref);
        if (value !== null) return value;
      }
      return primary.get(ref);
    },
    set(ref: SecretRef, value: string): void {
      primary.set(ref, value);
    },
    delete(ref: SecretRef): void {
      primary.delete(ref);
    },
    list(prefix = ""): SecretRef[] {
      const refs = new Set<SecretRef>();
      for (const store of [...overlays, primary]) {
        store.list?.(prefix)?.forEach((ref) => refs.add(ref));
      }
      return [...refs];
    },
  };
}

/**
 * Default backend selection for reference hosts and embedders without a custom
 * vault. Production embedders should pass `host` with an OS-backed implementation.
 */
export function createDefaultSecretStore(options?: DefaultSecretStoreOptions): SecretStore {
  const backend = options?.backend ?? "auto";
  const host = options?.host ?? readInjectedHostStore();

  if (backend === "memory") {
    return createMemorySecretStore(options?.memorySeed);
  }

  if (backend === "localStorage") {
    return createLocalStorageSecretStore();
  }

  const persistent =
    typeof localStorage !== "undefined"
      ? createLocalStorageSecretStore()
      : createMemorySecretStore(options?.memorySeed);

  if (!host) return persistent;
  return createLayeredSecretStore(persistent, host);
}
