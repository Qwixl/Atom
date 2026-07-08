/** Helpers for building registry revocations.json rows (M-TS-04). */

import type { RegistryRevocation, RegistryRevocations } from "./trust.js";

export function createRevocationEntry(input: {
  id: string;
  version: string;
  reason?: string;
  revokedAt?: string;
}): RegistryRevocation {
  const id = input.id.trim();
  const version = input.version.trim();
  if (!id) throw new Error("revocation id required");
  if (!version) throw new Error("revocation version required");
  return {
    id,
    version,
    reason: input.reason?.trim() || undefined,
    revokedAt: input.revokedAt ?? new Date().toISOString(),
  };
}

/** Append (or replace same id@version) into a revocations document. */
export function upsertRevocation(
  doc: RegistryRevocations | null | undefined,
  entry: RegistryRevocation,
): RegistryRevocations {
  const revoked = [...(doc?.revoked ?? [])];
  const index = revoked.findIndex((item) => item.id === entry.id && item.version === entry.version);
  if (index >= 0) {
    revoked[index] = entry;
  } else {
    revoked.push(entry);
  }
  return { revocationsVersion: 1, revoked };
}
