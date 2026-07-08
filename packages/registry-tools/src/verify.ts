import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verify as verifySigstoreBundle } from "sigstore";
import {
  formatIntegrity,
  normalizeModulePricing,
  validateModuleManifest,
  bundleStatementReferencesDigest,
  isSigstoreBundleShape,
  type RegistryIndex,
  type RegistryModuleEntry,
} from "@qwixl/shell-core";

/** Duplicate `id@version` rows in index.json (M-TS-09). */
export function findRegistryIndexDuplicateErrors(modules: RegistryModuleEntry[]): string[] {
  const byKey = new Map<string, RegistryModuleEntry[]>();
  for (const entry of modules) {
    const key = `${entry.id}@${entry.version}`;
    const list = byKey.get(key) ?? [];
    list.push(entry);
    byKey.set(key, list);
  }
  const errors: string[] = [];
  for (const [key, entries] of byKey) {
    if (entries.length <= 1) continue;
    const manifestUrls = [...new Set(entries.map((entry) => entry.manifestUrl))];
    errors.push(
      `duplicate index entry ${key} (${entries.length}x); manifest paths: ${manifestUrls.join(", ")}`,
    );
  }
  return errors;
}

export interface VerifyOptions {
  registryDir: string;
  /** Directory bundles resolve from when manifest bundleUrl is absolute-from-root (e.g. /modules/...). */
  bundleBase: string;
  /** Fail when index entries omit integrity hashes. */
  requireIntegrity?: boolean;
  /** When true, verify Sigstore bundle digest match for manifests with signatureUrl. */
  verifySignatures?: boolean;
  /** Fail when verifySignatures is on and a manifest omits signatureUrl (M-TS-03). */
  requireSignatures?: boolean;
  /**
   * Soft-fail Sigstore for rows without signatureUrl (CI default until all modules are signed).
   * Still fails when a listing includes a broken/mismatched signatureUrl.
   */
  softRequireSignatures?: boolean;
  /** Fail when curated listings omit a publisher DID (M-TS-03 identity baseline). */
  requirePublisher?: boolean;
  /** When set, fail if publisher is outside this allowlist. */
  trustedPublishers?: readonly string[];
  /** Run bundle malware heuristics after integrity checks (M-TS-02). */
  scanBundles?: boolean;
  /** Treat external script/fetch patterns as errors (default: warnings only). */
  scanStrictExternal?: boolean;
  maxBundleBytes?: number;
}

const TEXT_HASH_EXTENSIONS = new Set([".html", ".json", ".js", ".css", ".mjs", ".ts"]);

export function isRegistryTextPath(filePath: string): boolean {
  return TEXT_HASH_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Canonical LF normalization for registry text assets (CRLF and lone CR → LF). */
export function normalizeRegistryText(bytes: Uint8Array): Uint8Array {
  const text = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(text, "utf8");
}

function normalizeTextBytes(bytes: Uint8Array, filePath: string): Uint8Array {
  if (!isRegistryTextPath(filePath)) return bytes;
  return normalizeRegistryText(bytes);
}

export function hasLfLineEndings(bytes: Uint8Array, filePath: string): boolean {
  if (!isRegistryTextPath(filePath)) return true;
  return Buffer.from(bytes).equals(normalizeRegistryText(bytes));
}

export function lfLineEndingError(label: string, filePath: string, bytes: Uint8Array): string | undefined {
  if (hasLfLineEndings(bytes, filePath)) return undefined;
  return `${label}: text file must use LF line endings only (${filePath}); run atom-registry publish-all to normalize`;
}

async function readRegistryTextFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/** Normalize text assets on disk so git, CI, and integrity hashes agree. */
export async function normalizeRegistryTextFile(filePath: string): Promise<Uint8Array> {
  const bytes = await readRegistryTextFile(filePath);
  if (!isRegistryTextPath(filePath)) return bytes;
  const normalized = normalizeRegistryText(bytes);
  if (!Buffer.from(bytes).equals(normalized)) {
    await writeFile(filePath, normalized);
  }
  return normalized;
}

function sha256File(bytes: Uint8Array, filePath?: string): string {
  const normalized = filePath ? normalizeTextBytes(bytes, filePath) : bytes;
  return createHash("sha256").update(normalized).digest("hex");
}

function resolveBundlePath(bundleUrl: string, manifestPath: string, bundleBase: string): string {
  if (bundleUrl.startsWith("/")) {
    return path.join(bundleBase, bundleUrl.slice(1));
  }
  return path.resolve(path.dirname(manifestPath), bundleUrl);
}

export async function verifyRegistry(options: VerifyOptions): Promise<void> {
  const indexPath = path.join(options.registryDir, "index.json");
  const indexRaw = await readFile(indexPath);
  const index = JSON.parse(indexRaw.toString("utf8")) as RegistryIndex;

  if (index.registryVersion !== 1 || !Array.isArray(index.modules)) {
    throw new Error("Invalid index.json");
  }

  const errors: string[] = [];

  errors.push(...findRegistryIndexDuplicateErrors(index.modules));

  for (const registryFile of ["index.json", "revocations.json"]) {
    const filePath = path.join(options.registryDir, registryFile);
    try {
      const bytes = await readFile(filePath);
      const lfError = lfLineEndingError(registryFile, filePath, bytes);
      if (lfError) errors.push(lfError);
    } catch {
      // revocations.json is optional until populated
    }
  }

  for (const entry of index.modules) {
    try {
      await verifyEntry(entry, options, errors);
    } catch (error) {
      errors.push(
        `${entry.id}@${entry.version}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Registry verification failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  console.log(`Verified ${index.modules.length} module(s) in ${options.registryDir}`);

  if (options.scanBundles) {
    const { scanRegistryBundles, formatBundleScanReport } = await import("./bundleScan.js");
    const scanIssues = await scanRegistryBundles({
      registryDir: options.registryDir,
      bundleBase: options.bundleBase,
      maxBytes: options.maxBundleBytes,
      strictExternal: options.scanStrictExternal,
    });
    const scanErrors = scanIssues.filter((i) => i.severity === "error");
    const scanWarnings = scanIssues.filter((i) => i.severity === "warning");
    if (scanWarnings.length > 0) {
      console.warn(`Bundle scan warnings:\n${formatBundleScanReport(scanWarnings)}`);
    }
    if (scanErrors.length > 0) {
      throw new Error(`Bundle scan failed:\n${formatBundleScanReport(scanErrors)}`);
    }
    console.log(`Bundle scan passed (${index.modules.length} module(s))`);
  }
}

function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .sort((a, b) => a.localeCompare(b));
}

async function verifyEntry(
  entry: RegistryModuleEntry,
  options: VerifyOptions,
  errors: string[],
): Promise<void> {
  if (options.requireIntegrity && !entry.integrity) {
    errors.push(`${entry.id}: missing index integrity hash`);
    return;
  }

  const manifestPath = path.resolve(options.registryDir, entry.manifestUrl);
  const manifestBytes = await readFile(manifestPath);
  const manifestLfError = lfLineEndingError(entry.id, manifestPath, manifestBytes);
  if (manifestLfError) {
    errors.push(manifestLfError);
    return;
  }
  const manifestDigest = sha256File(manifestBytes, manifestPath);

  if (entry.integrity) {
    const expected = entry.integrity.replace(/^sha256:/, "");
    if (manifestDigest !== expected) {
      errors.push(`${entry.id}: manifest integrity mismatch`);
      return;
    }
  }

  const manifest = validateModuleManifest(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.id !== entry.id || manifest.version !== entry.version) {
    errors.push(`${entry.id}: manifest id/version mismatch with index`);
    return;
  }

  if (!manifest.bundleIntegrity) {
    errors.push(`${entry.id}: manifest missing bundleIntegrity`);
    return;
  }

  const bundlePath = resolveBundlePath(manifest.bundleUrl, manifestPath, options.bundleBase);
  const bundleBytes = await readFile(bundlePath);
  const bundleLfError = lfLineEndingError(entry.id, bundlePath, bundleBytes);
  if (bundleLfError) {
    errors.push(bundleLfError);
    return;
  }
  const bundleDigest = sha256File(bundleBytes, bundlePath);
  const expectedBundle = manifest.bundleIntegrity.replace(/^sha256:/, "");

  if (bundleDigest !== expectedBundle) {
    errors.push(`${entry.id}: bundle integrity mismatch (${bundlePath})`);
    return;
  }

  if (entry.bundleIntegrity) {
    const indexBundle = entry.bundleIntegrity.replace(/^sha256:/, "");
    if (indexBundle !== expectedBundle) {
      errors.push(`${entry.id}: index bundleIntegrity mismatch`);
    }
  }

  if (entry.publisher && entry.publisher !== manifest.publisher) {
    errors.push(`${entry.id}: index publisher mismatch`);
  }

  const publisher = (manifest.publisher ?? entry.publisher)?.trim() ?? "";
  if (options.requirePublisher && !publisher) {
    errors.push(`${entry.id}: missing publisher DID (M-TS-03 curated store requires publisher)`);
  }
  if (options.trustedPublishers && options.trustedPublishers.length > 0) {
    if (!publisher || !options.trustedPublishers.includes(publisher)) {
      errors.push(
        `${entry.id}: publisher ${publisher || "(none)"} is outside trustedPublishers allowlist`,
      );
    }
  }

  if (entry.tier && manifest.tier && entry.tier !== manifest.tier) {
    errors.push(`${entry.id}: index/manifest tier mismatch`);
  }

  const indexPricing = normalizeModulePricing(entry.pricing);
  const manifestPricing = normalizeModulePricing(manifest.pricing);
  if (JSON.stringify(indexPricing) !== JSON.stringify(manifestPricing)) {
    errors.push(`${entry.id}: index pricing mismatch with manifest`);
  }

  const indexCategories = normalizeCategories(entry.categories);
  const manifestCategories = normalizeCategories(manifest.categories);
  if (JSON.stringify(indexCategories) !== JSON.stringify(manifestCategories)) {
    errors.push(`${entry.id}: index categories mismatch with manifest`);
  }

  if (options.verifySignatures) {
    const signatureUrl = manifest.signatureUrl ?? entry.signatureUrl;
    if (!signatureUrl) {
      if (options.requireSignatures && !options.softRequireSignatures) {
        errors.push(`${entry.id}: missing signatureUrl (required for curated registry listings)`);
      } else {
        console.warn(
          `Warning: ${entry.id}@${entry.version} has no signatureUrl (M-TS-03: Sigstore pending; publisher DID is required)`,
        );
      }
    } else {
      try {
        await verifySignatureDigest(
          manifestBytes,
          signatureUrl,
          manifestPath,
          options.bundleBase,
          true,
        );
      } catch (error) {
        errors.push(
          `${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

async function verifySignatureDigest(
  manifestBytes: Buffer,
  signatureUrl: string,
  manifestPath: string,
  bundleBase: string,
  verifyCrypto: boolean,
): Promise<void> {
  const signaturePath = signatureUrl.startsWith("/")
    ? path.join(bundleBase, signatureUrl.slice(1))
    : path.resolve(path.dirname(manifestPath), signatureUrl);

  const raw = await readFile(signaturePath);
  const bundle = JSON.parse(raw.toString("utf8")) as unknown;
  if (!isSigstoreBundleShape(bundle)) {
    throw new Error("invalid Sigstore bundle structure");
  }

  const digest = sha256File(manifestBytes, manifestPath);
  if (!bundleStatementReferencesDigest(bundle, digest)) {
    throw new Error("Sigstore bundle does not reference manifest digest");
  }

  if (verifyCrypto) {
    await verifySigstoreBundle(
      bundle as Parameters<typeof verifySigstoreBundle>[0],
      manifestBytes,
    );
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return formatIntegrity(sha256File(bytes, filePath));
}

export interface PublishOptions {
  registryDir: string;
  moduleDir: string;
  bundleBase: string;
  publisher?: string;
}

/** Recompute integrity hashes and upsert a module entry in index.json. */
export async function publishModule(options: PublishOptions): Promise<void> {
  const manifestPath = path.join(options.moduleDir, "manifest.json");
  const manifestBytes = await normalizeRegistryTextFile(manifestPath);
  const manifest = validateModuleManifest(
    JSON.parse(Buffer.from(manifestBytes).toString("utf8")),
  );

  const bundlePath = resolveBundlePath(manifest.bundleUrl, manifestPath, options.bundleBase);
  const bundleBytes = await normalizeRegistryTextFile(bundlePath);

  const manifestIntegrity = formatIntegrity(sha256File(manifestBytes, manifestPath));
  const bundleIntegrity = formatIntegrity(sha256File(bundleBytes, bundlePath));

  const updatedManifest = {
    ...manifest,
    bundleIntegrity,
    publisher: options.publisher ?? manifest.publisher,
  };
  await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);

  const freshManifestBytes = await readFile(manifestPath);
  const freshIntegrity = formatIntegrity(sha256File(freshManifestBytes, manifestPath));

  const indexPath = path.join(options.registryDir, "index.json");
  let index: RegistryIndex;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8")) as RegistryIndex;
  } catch {
    index = { registryVersion: 1, modules: [], updatedAt: new Date().toISOString() };
  }

  const manifestUrl = path.relative(options.registryDir, manifestPath).replace(/\\/g, "/");
  const entry: RegistryModuleEntry = {
    id: manifest.id,
    version: manifest.version,
    manifestUrl,
    integrity: freshIntegrity,
    bundleIntegrity,
    publisher: updatedManifest.publisher,
    ...(updatedManifest.pricing ? { pricing: updatedManifest.pricing } : {}),
    ...(updatedManifest.categories?.length
      ? { categories: [...updatedManifest.categories] }
      : {}),
    ...(updatedManifest.tier ? { tier: updatedManifest.tier } : {}),
  };

  index.modules = index.modules.filter(
    (item) => !(item.id === entry.id && item.version === entry.version),
  );
  index.modules.push(entry);
  index.updatedAt = new Date().toISOString();

  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Published ${entry.id}@${entry.version}`);
  console.log(`  manifest integrity: ${freshIntegrity}`);
  console.log(`  bundle integrity:   ${bundleIntegrity}`);
}
