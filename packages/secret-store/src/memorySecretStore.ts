import type { SecretRef, SecretStore } from "./types.js";

/** In-memory backend for tests and ephemeral sessions. */
export function createMemorySecretStore(initial?: Record<SecretRef, string>): SecretStore {
  const secrets = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get(ref: SecretRef): string | null {
      return secrets.get(ref) ?? null;
    },
    set(ref: SecretRef, value: string): void {
      secrets.set(ref, value);
    },
    delete(ref: SecretRef): void {
      secrets.delete(ref);
    },
    list(prefix = ""): SecretRef[] {
      return [...secrets.keys()].filter((ref) => !prefix || ref.startsWith(prefix));
    },
  };
}
