import type { Catalog } from "./catalog.js";
import type { Composition, CompositionNode } from "./types.js";
import {
  LocalStorageRegistryCache,
  readCachedManifest,
  writeCachedIndex,
  writeCachedManifest,
} from "./registry/cache.js";
import { integrityMatches, sha256Hex } from "./registry/hash.js";
import { validateModuleManifest } from "./registry/manifest.js";
import { verifyManifestSignature } from "./registry/signature.js";
import {
  assertTrustPolicy,
  isRevoked,
  type RegistryRevocation,
  type RegistryRevocations,
  type RegistryTrustPolicy,
} from "./registry/trust.js";
import type { RegistryCacheStore, RegistryIndex, RegistryModuleEntry } from "./registry/types.js";
import { resolveRegistryUrl } from "./registry/resolveUrl.js";

export type {
  RegistryIndex,
  RegistryModuleEntry,
  RegistryCacheSnapshot,
  RegistryCacheStore,
} from "./registry/types.js";
export type { RegistryTrustPolicy, RegistryRevocation, RegistryRevocations } from "./registry/trust.js";
export { LocalStorageRegistryCache, manifestCacheKey } from "./registry/cache.js";
export { validateModuleManifest } from "./registry/manifest.js";
export { formatIntegrity, parseIntegrity, sha256Hex, integrityMatches } from "./registry/hash.js";
export { assertTrustPolicy, isRevoked } from "./registry/trust.js";
export {
  validateModulePricing,
  normalizeModulePricing,
  formatModulePrice,
  modulePriceLabel,
  MODULE_STORE_BETA_FREE,
} from "./registry/pricing.js";
export type { ModulePricing } from "./registry/pricing.js";
export {
  verifyManifestSignature,
  isSigstoreBundleShape,
  bundleStatementReferencesDigest,
} from "./registry/signature.js";

export interface ModuleRegistryOptions {
  indexUrl: string;
  fetch?: typeof fetch;
  /** Owner install policy. Default: require manifest integrity. */
  trust?: RegistryTrustPolicy;
  /** Persist fetched index/manifests. Default: localStorage in browser. Pass `false` to disable. */
  cache?: RegistryCacheStore | false;
  /** Verify bundle bytes against manifest.bundleIntegrity when present. Default true. */
  verifyBundle?: boolean;
  /** Verify Sigstore bundle references manifest digest when signatureUrl present. Default true. */
  verifySignature?: boolean;
}

/** Browser fetch must keep global `this`; unbound references throw "Illegal invocation". */
function bindFetch(fetchImpl: typeof fetch): typeof fetch {
  return ((input, init?) => fetchImpl(input, init)) as typeof fetch;
}

function parseReference(reference: string): { name: string; version?: string } {
  const at = reference.lastIndexOf("@");
  if (at > 0) {
    return { name: reference.slice(0, at), version: reference.slice(at + 1) };
  }
  return { name: reference };
}

/** v1: exact semver match, or major-only request ("1" matches "1.0.0"). */
export function versionMatches(requested: string | undefined, published: string): boolean {
  if (!requested) return true;
  if (requested === published) return true;
  const pubParts = published.split(".");
  const reqParts = requested.split(".");
  if (reqParts.length === 1 && /^\d+$/.test(reqParts[0] ?? "")) {
    return pubParts[0] === reqParts[0];
  }
  return false;
}

export function collectComponentReferences(composition: Composition): string[] {
  const refs = new Set<string>();
  function walk(node: CompositionNode): void {
    refs.add(node.component);
    for (const child of node.children ?? []) walk(child);
  }
  walk(composition.root);
  return [...refs];
}

function isCoreReference(reference: string): boolean {
  return parseReference(reference).name.startsWith("core/");
}

function moduleIdFromReference(reference: string): string {
  return parseReference(reference).name;
}

/**
 * Fetches a registry index and lazily installs modules into a Catalog on first
 * composition reference. Precedent: Homebrew taps — forkable static index, no
 * accounts. Sigstore: runtime DSSE digest match; full Rekor crypto via CLI.
 * Manifest + bundle sha256 integrity supported.
 */
export class ModuleRegistry {
  private indexUrl: string;
  private fetchFn: typeof fetch;
  private trust: RegistryTrustPolicy | undefined;
  private cache: RegistryCacheStore | false;
  private verifyBundle: boolean;
  private verifySignature: boolean;
  private index: RegistryIndex | null = null;
  private indexPromise: Promise<RegistryIndex> | null = null;
  private revocations: RegistryRevocations | null = null;
  private revocationsPromise: Promise<RegistryRevocations | null> | null = null;
  private pending = new Map<string, Promise<void>>();
  private installed = new Set<string>();
  private lastError: string | null = null;

  constructor(options: ModuleRegistryOptions) {
    this.indexUrl = options.indexUrl;
    this.fetchFn = bindFetch(options.fetch ?? fetch);
    this.trust = {
      requireIntegrity: true,
      requireSignature: false,
      ...options.trust,
    };
    this.cache =
      options.cache === false
        ? false
        : (options.cache ?? new LocalStorageRegistryCache());
    this.verifyBundle = options.verifyBundle !== false;
    this.verifySignature = options.verifySignature !== false;
  }

  get indexLocation(): string {
    return this.indexUrl;
  }

  /** Last install failure message, cleared on success. */
  get installError(): string | null {
    return this.lastError;
  }

  installedModuleIds(): string[] {
    return [...this.installed];
  }

  /** Revocations loaded from index.revocationsUrl, or null if none/unloaded. */
  getRevocations(): RegistryRevocations | null {
    return this.revocations;
  }

  /** Module ids currently revoked (all versions or specific version). */
  listRevoked(): RegistryRevocation[] {
    return this.revocations?.revoked ?? [];
  }

  async refreshRevocations(): Promise<RegistryRevocations | null> {
    this.revocations = null;
    this.revocationsPromise = null;
    return this.loadRevocations(true);
  }

  clearCache(): void {
    if (this.cache) this.cache.clear(this.indexUrl);
    this.index = null;
    this.indexPromise = null;
    this.revocations = null;
    this.revocationsPromise = null;
  }

  async loadIndex(force = false): Promise<RegistryIndex> {
    if (!force && this.index) return this.index;
    if (!force && this.indexPromise) return this.indexPromise;

    this.indexPromise = this.fetchIndex(force);
    this.index = await this.indexPromise;
    return this.index;
  }

  async loadRevocations(force = false): Promise<RegistryRevocations | null> {
    if (!force && this.revocations !== null) return this.revocations;
    if (!force && this.revocationsPromise) return this.revocationsPromise;

    this.revocationsPromise = this.fetchRevocations();
    this.revocations = await this.revocationsPromise;
    return this.revocations;
  }

  private async fetchIndex(force: boolean): Promise<RegistryIndex> {
    if (!force && this.cache) {
      const cached = this.cache.load(this.indexUrl);
      if (cached?.index) {
        this.index = cached.index;
        return cached.index;
      }
    }

    const response = await this.fetchFn(this.indexUrl);
    if (!response.ok) {
      throw new Error(`Registry index fetch failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as RegistryIndex;
    if (data.registryVersion !== 1 || !Array.isArray(data.modules)) {
      throw new Error("Invalid registry index format");
    }
    if (this.cache) writeCachedIndex(this.cache, this.indexUrl, data);
    return data;
  }

  private async fetchRevocations(): Promise<RegistryRevocations | null> {
    const index = await this.loadIndex();
    if (!index.revocationsUrl) return null;

    const url = resolveRegistryUrl(index.revocationsUrl, this.indexUrl);
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Revocations fetch failed: ${response.status}`);
    }
    const data = (await response.json()) as RegistryRevocations;
    if (data.revocationsVersion !== 1 || !Array.isArray(data.revoked)) {
      throw new Error("Invalid revocations format");
    }
    return data;
  }

  /**
   * Fetch and install any missing modules referenced by a composition.
   * Core references are ignored; unknown community refs are skipped silently
   * (resolver fallback handles missing modules).
   */
  async ensureModules(catalog: Catalog, composition: Composition): Promise<void> {
    const refs = collectComponentReferences(composition).filter((ref) => !isCoreReference(ref));
    await Promise.all(refs.map((ref) => this.ensureModule(catalog, ref)));
  }

  async ensureModule(catalog: Catalog, reference: string): Promise<void> {
    const moduleId = moduleIdFromReference(reference);
    const { version } = parseReference(reference);

    if (this.pending.has(moduleId)) {
      await this.pending.get(moduleId);
      return;
    }

    const work = this.fetchAndInstall(catalog, moduleId, version, reference);
    this.pending.set(moduleId, work);
    try {
      await work;
    } finally {
      this.pending.delete(moduleId);
    }
  }

  /**
   * Reload revocations and uninstall any installed modules that appear on the
   * revocation list. Returns entries that were evicted.
   */
  async syncRevocations(catalog: Catalog): Promise<RegistryRevocation[]> {
    const revocations = await this.refreshRevocations();
    if (!revocations) return [];

    const index = await this.loadIndex();
    const evicted: RegistryRevocation[] = [];

    for (const moduleId of [...this.installed]) {
      const entry = index.modules.find((candidate) => candidate.id === moduleId);
      if (!entry) continue;
      const hit = revocations.revoked.find(
        (item) =>
          item.id === moduleId &&
          (item.version === "*" || item.version === entry.version),
      );
      if (!hit) continue;
      catalog.uninstallModule(moduleId);
      this.installed.delete(moduleId);
      evicted.push(hit);
    }

    return evicted;
  }

  private async fetchAndInstall(
    catalog: Catalog,
    moduleId: string,
    requestedVersion?: string,
    reference?: string,
  ): Promise<void> {
    this.lastError = null;
    try {
      const index = await this.loadIndex();
      const entry = index.modules.find(
        (candidate) =>
          candidate.id === moduleId && versionMatches(requestedVersion, candidate.version),
      );

      const revocations = await this.loadRevocations();
      const installedVersion = entry?.version;
      if (
        entry &&
        installedVersion &&
        isRevoked(revocations, moduleId, installedVersion)
      ) {
        if (catalog.lookup(reference ?? moduleId) || this.installed.has(moduleId)) {
          catalog.uninstallModule(moduleId);
          this.installed.delete(moduleId);
        }
        throw new Error(`Module ${moduleId}@${installedVersion} is revoked`);
      }

      if (reference && catalog.lookup(reference)) return;
      if (!entry) return;

      const manifestUrl = resolveRegistryUrl(entry.manifestUrl, this.indexUrl);
      const bytes = await this.fetchManifestBytes(entry, moduleId, manifestUrl);

      if (entry.integrity && !(await integrityMatches(bytes, entry.integrity))) {
        throw new Error(`Manifest integrity mismatch for ${moduleId}`);
      }

      const manifest = validateModuleManifest(JSON.parse(new TextDecoder().decode(bytes)));
      if (manifest.id !== moduleId) {
        throw new Error(`Manifest id ${manifest.id} does not match registry entry ${moduleId}`);
      }
      if (manifest.version !== entry.version) {
        throw new Error(
          `Manifest version ${manifest.version} does not match index entry ${entry.version}`,
        );
      }

      assertTrustPolicy(this.trust, entry, manifest.publisher);

      const signatureUrl = manifest.signatureUrl ?? entry.signatureUrl;
      if (this.verifySignature || this.trust?.requireSignature) {
        await verifyManifestSignature(bytes, signatureUrl, manifestUrl, this.fetchFn, {
          requirePresent: this.trust?.requireSignature === true,
        });
      }

      if (entry.bundleIntegrity && manifest.bundleIntegrity) {
        const entryDigest = entry.bundleIntegrity.replace(/^sha256:/, "");
        const manifestDigest = manifest.bundleIntegrity.replace(/^sha256:/, "");
        if (entryDigest !== manifestDigest) {
          throw new Error(`Index/manifest bundleIntegrity mismatch for ${moduleId}`);
        }
      }

      if (this.verifyBundle && manifest.bundleIntegrity) {
        await this.verifyBundleBytes(manifest.bundleUrl, manifestUrl, manifest.bundleIntegrity);
      }

      catalog.installModule(manifest);
      this.installed.add(moduleId);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async fetchManifestBytes(
    entry: RegistryModuleEntry,
    moduleId: string,
    manifestUrl: string,
  ): Promise<Uint8Array> {
    if (this.cache) {
      const cached = readCachedManifest(
        this.cache,
        this.indexUrl,
        moduleId,
        entry.version,
        manifestUrl,
      );
      if (cached) return cached;
    }

    const response = await this.fetchFn(manifestUrl);
    if (!response.ok) {
      throw new Error(`Manifest fetch failed for ${moduleId}: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (this.cache && this.index) {
      writeCachedManifest(
        this.cache,
        this.indexUrl,
        this.index,
        moduleId,
        entry.version,
        manifestUrl,
        bytes,
      );
    }
    return bytes;
  }

  private async verifyBundleBytes(
    bundleUrl: string,
    manifestUrl: string,
    bundleIntegrity: string,
  ): Promise<void> {
    const resolved = resolveRegistryUrl(bundleUrl, manifestUrl);
    const response = await this.fetchFn(resolved);
    if (!response.ok) {
      throw new Error(`Bundle fetch failed: ${response.status} ${resolved}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!(await integrityMatches(bytes, bundleIntegrity))) {
      throw new Error(`Bundle integrity mismatch for ${resolved}`);
    }
  }

  uninstallAll(catalog: Catalog): void {
    for (const moduleId of this.installed) {
      catalog.uninstallModule(moduleId);
    }
    this.installed.clear();
  }
}

/** Compute sha256 integrity strings for a manifest file and its bundle (Node or browser). */
export async function computeModuleIntegrity(
  manifestBytes: Uint8Array,
  fetchBundle: (bundleUrl: string, manifestJson: unknown) => Promise<Uint8Array>,
): Promise<{ manifestIntegrity: string; bundleIntegrity?: string }> {
  const manifestIntegrity = `sha256:${await sha256Hex(manifestBytes)}`;
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { bundleUrl?: string };
  if (!manifest.bundleUrl) return { manifestIntegrity };
  const bundleBytes = await fetchBundle(manifest.bundleUrl, manifest);
  return {
    manifestIntegrity,
    bundleIntegrity: `sha256:${await sha256Hex(bundleBytes)}`,
  };
}
