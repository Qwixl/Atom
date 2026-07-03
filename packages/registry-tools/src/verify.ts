import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verify as verifySigstoreBundle } from "sigstore";
import {
  formatIntegrity,
  validateModuleManifest,
  bundleStatementReferencesDigest,
  isSigstoreBundleShape,
  type RegistryIndex,
  type RegistryModuleEntry,
} from "@qwixl/shell-core";

export interface VerifyOptions {
  registryDir: string;
  /** Directory bundles resolve from when manifest bundleUrl is absolute-from-root (e.g. /modules/...). */
  bundleBase: string;
  /** Fail when index entries omit integrity hashes. */
  requireIntegrity?: boolean;
  /** When true, verify Sigstore bundle digest match for manifests with signatureUrl. */
  verifySignatures?: boolean;
}

const TEXT_HASH_EXTENSIONS = new Set([".html", ".json", ".js", ".css", ".mjs", ".ts"]);

/** Normalize CRLF→LF before hashing text bundles so verify matches Linux CI and production hosts. */
function normalizeTextBytes(bytes: Uint8Array, filePath: string): Uint8Array {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_HASH_EXTENSIONS.has(ext)) return bytes;
  const text = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
  return Buffer.from(text, "utf8");
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

  if (options.verifySignatures) {
    const signatureUrl = manifest.signatureUrl ?? entry.signatureUrl;
    if (signatureUrl) {
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
  const manifestBytes = await readFile(manifestPath);
  const manifest = validateModuleManifest(JSON.parse(manifestBytes.toString("utf8")));

  const bundlePath = resolveBundlePath(manifest.bundleUrl, manifestPath, options.bundleBase);
  const bundleBytes = await readFile(bundlePath);

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
