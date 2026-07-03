/** Stable id for a credential value (e.g. `atom.llm.primary`). See docs/04-security/01-secret-storage.md. */
export type SecretRef = string;

/** Host-registered backend for credential get/set/delete by ref. */
export interface SecretStore {
  get(ref: SecretRef): string | null;
  set(ref: SecretRef, value: string): void;
  delete(ref: SecretRef): void;
  /** Optional: list refs with a given prefix for settings UI. */
  list?(prefix?: string): SecretRef[];
}
