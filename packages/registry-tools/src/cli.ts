#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, publishModule, verifyRegistry } from "./verify.js";
import { scaffoldModule } from "./scaffold.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(packageRoot, "../..");
const monorepoRegistry = path.join(monorepoRoot, "apps/shell/public/registry");
const monorepoBundleBase = path.join(monorepoRoot, "apps/shell/public");
const inMonorepo = existsSync(monorepoRegistry);

const defaultRegistryDir = inMonorepo
  ? monorepoRegistry
  : path.join(process.cwd(), "registry");
const defaultBundleBase = inMonorepo
  ? monorepoBundleBase
  : process.cwd();

function usage(): never {
  console.log(`atom-registry — hash, verify, and publish module registry indexes

Usage:
  atom-registry scaffold --id <namespace/name> --out <dir> [--publisher <did>]
  atom-registry hash <file>
  atom-registry verify [--registry-dir <dir>] [--bundle-base <dir>] [--require-integrity] [--signatures] [--scan-bundles] [--scan-strict-external]
  atom-registry publish [--registry-dir <dir>] [--module-dir <dir>] [--bundle-base <dir>]
  atom-registry publish-all [--registry-dir <dir>] [--bundle-base <dir>]

  --signatures  Full Sigstore verification (Rekor + x509 chain) via sigstore-js, in addition to digest match.
  --scan-bundles  Heuristic bundle scan after integrity checks (eval, size cap, external scripts).
  --scan-strict-external  Treat external script/fetch as errors instead of warnings.

Defaults:
  registry-dir  ${defaultRegistryDir}
  bundle-base   ${defaultBundleBase}
  module-dir    <registry-dir>/travel/seat-map
`);
  process.exit(1);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const userCwd = process.env.INIT_CWD ?? process.cwd();
  if (!command) usage();

  if (command === "scaffold") {
    const moduleId = readFlag(args, "--id");
    const outDir = readFlag(args, "--out");
    const publisher = readFlag(args, "--publisher");
    if (!moduleId || !outDir) usage();
    scaffoldModule({
      moduleId,
      outDir: path.resolve(userCwd, outDir),
      publisher,
    });
    return;
  }

  if (command === "hash") {
    const file = args[1];
    if (!file) usage();
    console.log(await hashFile(path.resolve(file)));
    return;
  }

  if (command === "verify") {
    const registryDir = readFlag(args, "--registry-dir") ?? defaultRegistryDir;
    const bundleBase = readFlag(args, "--bundle-base") ?? defaultBundleBase;
    await verifyRegistry({
      registryDir: path.resolve(registryDir),
      bundleBase: path.resolve(bundleBase),
      requireIntegrity: args.includes("--require-integrity"),
      verifySignatures: args.includes("--signatures"),
      scanBundles: args.includes("--scan-bundles"),
      scanStrictExternal: args.includes("--scan-strict-external"),
    });
    return;
  }

  if (command === "publish") {
    const registryDir = readFlag(args, "--registry-dir") ?? defaultRegistryDir;
    const moduleDir =
      readFlag(args, "--module-dir") ?? path.join(path.resolve(registryDir), "travel/seat-map");
    const bundleBase = readFlag(args, "--bundle-base") ?? defaultBundleBase;
    await publishModule({
      registryDir: path.resolve(registryDir),
      moduleDir: path.resolve(moduleDir),
      bundleBase: path.resolve(bundleBase),
    });
    return;
  }

  if (command === "publish-all") {
    const registryDir = path.resolve(readFlag(args, "--registry-dir") ?? defaultRegistryDir);
    const bundleBase = path.resolve(readFlag(args, "--bundle-base") ?? defaultBundleBase);
    const moduleDirs = await findManifestDirs(registryDir);
    for (const moduleDir of moduleDirs.sort()) {
      await publishModule({ registryDir, moduleDir, bundleBase });
    }
    console.log(`Published ${moduleDirs.length} module(s).`);
    return;
  }

  usage();
}

async function findManifestDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    const manifest = path.join(full, "manifest.json");
    try {
      await stat(manifest);
      dirs.push(full);
    } catch {
      dirs.push(...(await findManifestDirs(full)));
    }
  }
  return dirs;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
