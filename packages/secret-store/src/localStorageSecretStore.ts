import type { SecretRef, SecretStore } from "./types.js";

const STORAGE_PREFIX = "atom-secret:";

/** Browser dev backend: values keyed by ref, separate from connection JSON. */
export function createLocalStorageSecretStore(): SecretStore {
  return {
    get(ref: SecretRef): string | null {
      if (typeof localStorage === "undefined") return null;
      try {
        return localStorage.getItem(STORAGE_PREFIX + ref);
      } catch {
        return null;
      }
    },
    set(ref: SecretRef, value: string): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(STORAGE_PREFIX + ref, value);
      } catch {
        // Best-effort persistence.
      }
    },
    delete(ref: SecretRef): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(STORAGE_PREFIX + ref);
      } catch {
        // Best-effort.
      }
    },
    list(prefix = ""): SecretRef[] {
      if (typeof localStorage === "undefined") return [];
      const refs: SecretRef[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(STORAGE_PREFIX)) continue;
          const ref = key.slice(STORAGE_PREFIX.length);
          if (!prefix || ref.startsWith(prefix)) refs.push(ref);
        }
      } catch {
        return [];
      }
      return refs;
    },
  };
}
