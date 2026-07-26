#!/usr/bin/env node
/**
 * Production shell dist (Apache platform only):
 * - dist/index.html — minimal platform landing
 * - dist/app/ — React SPA
 *
 * Qwixl commercial marketing (atom.qwixl.com) is built from private Atom-MC.
 */
import { cpSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellRoot = path.join(repoRoot, "apps", "shell");
const publicRoot = path.join(shellRoot, "public");
const distRoot = path.join(shellRoot, "dist");
const distApp = path.join(distRoot, "app");

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

const vite = spawnSync("pnpm", ["exec", "vite", "build"], {
  cwd: shellRoot,
  stdio: "inherit",
  shell: true,
});
if (vite.status !== 0) process.exit(vite.status ?? 1);

// vite already wrote dist/app; ensure platform landing at dist root
cpSync(path.join(publicRoot, "index.html"), path.join(distRoot, "index.html"));
// public assets already copied into dist/app by vite publicDir — also expose icons at site root
for (const name of ["icons", "fonts", "modules"]) {
  const from = path.join(publicRoot, name);
  try {
    if (statSync(from).isDirectory()) {
      cpSync(from, path.join(distRoot, name), { recursive: true });
    }
  } catch {
    /* optional */
  }
}

const appHtml = path.join(distApp, "app.html");
const appIndex = path.join(distApp, "index.html");
try {
  if (statSync(appHtml).isFile()) {
    renameSync(appHtml, appIndex);
  }
} catch {
  /* vite may already emit index */
}

console.log("dist/ — platform landing + dist/app/ React shell (no Qwixl marketing)");
