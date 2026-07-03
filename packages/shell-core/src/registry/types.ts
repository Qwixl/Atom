/** Registry index entry pointing at a module manifest. */
export interface RegistryModuleEntry {
  id: string;
  version: string;
  /** Relative to the index URL, or absolute. */
  manifestUrl: string;
  /** sha256 hex digest of manifest JSON bytes (`sha256:` prefix optional). */
  integrity?: string;
  /** Optional sha256 of bundle bytes; must match manifest.bundleIntegrity when both set. */
  bundleIntegrity?: string;
  /** Publisher DID; optional index-level hint for trust checks before manifest fetch. */
  publisher?: string;
  /** URL to Sigstore bundle JSON; runtime DSSE digest match; CLI `--signatures` for publish verify. */
  signatureUrl?: string;
}

export interface RegistryIndex {
  registryVersion: 1;
  modules: RegistryModuleEntry[];
  /** Relative or absolute URL to revocations list. */
  revocationsUrl?: string;
  updatedAt?: string;
}

export interface RegistryCacheSnapshot {
  indexUrl: string;
  index: RegistryIndex;
  fetchedAt: number;
  manifests: Record<
    string,
    {
      manifestUrl: string;
      bytesBase64: string;
      fetchedAt: number;
    }
  >;
}

export interface RegistryCacheStore {
  load(indexUrl: string): RegistryCacheSnapshot | null;
  save(snapshot: RegistryCacheSnapshot): void;
  clear(indexUrl?: string): void;
}
