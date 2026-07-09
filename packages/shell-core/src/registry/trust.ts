import type { RegistryModuleEntry } from "./types.js";

/** Owner-configurable install policy. Sigstore bundles: digest match at runtime; full crypto via CLI. */
export interface RegistryTrustPolicy {
  /** Refuse install when index entry omits manifest integrity hash. */
  requireIntegrity?: boolean;
  /** Refuse install when manifest omits signatureUrl or bundle digest match fails. */
  requireSignature?: boolean;
  /** Module ids the owner has deactivated (agent-invisible; card still shown). Legacy key name: blockedIds. */
  blockedIds?: string[];
  /** When non-empty, only manifests from these publisher DIDs install. */
  trustedPublishers?: string[];
}

export interface RegistryRevocation {
  id: string;
  /** Exact version, or "*" for all versions of this id. */
  version: string;
  reason?: string;
  revokedAt?: string;
}

export interface RegistryRevocations {
  revocationsVersion: 1;
  revoked: RegistryRevocation[];
}

export function assertTrustPolicy(
  policy: RegistryTrustPolicy | undefined,
  entry: RegistryModuleEntry,
  publisher: string,
): void {
  if (policy?.blockedIds?.includes(entry.id)) {
    throw new Error(`Module ${entry.id} is blocked by owner policy`);
  }
  if (policy?.requireIntegrity && !entry.integrity) {
    throw new Error(`Module ${entry.id} has no manifest integrity hash; install refused`);
  }
  const trusted = policy?.trustedPublishers;
  if (trusted && trusted.length > 0) {
    const expected = entry.publisher ?? publisher;
    if (!trusted.includes(expected)) {
      throw new Error(`Publisher ${expected} is not in trustedPublishers`);
    }
  }
}

export function isRevoked(
  revocations: RegistryRevocations | null,
  moduleId: string,
  version: string,
): boolean {
  if (!revocations) return false;
  return revocations.revoked.some((item) => {
    if (item.id !== moduleId) return false;
    if (item.version === "*") return true;
    return item.version === version;
  });
}
