import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatIntegrity,
  validateModuleManifest,
  type RegistryIndex,
  type RegistryModuleEntry,
} from "@atom/shell-core";

export interface VerifyOptions {
  registryDir: string;
  /** Directory bundles resolve from when manifest bundleUrl is absolute-from-root (e.g. /modules/...). */
  bundleBase: string;
  /** Fail when index entries omit integrity hashes. */
  requireIntegrity?: boolean;
}

function sha256File(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  const manifestDigest = sha256File(manifestBytes);

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
  const bundleDigest = sha256File(bundleBytes);
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
}

export async function hashFile(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return formatIntegrity(sha256File(bytes));
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

  const manifestIntegrity = formatIntegrity(sha256File(manifestBytes));
  const bundleIntegrity = formatIntegrity(sha256File(bundleBytes));

  const updatedManifest = {
    ...manifest,
    bundleIntegrity,
    publisher: options.publisher ?? manifest.publisher,
  };
  await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);

  const freshManifestBytes = await readFile(manifestPath);
  const freshIntegrity = formatIntegrity(sha256File(freshManifestBytes));

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
