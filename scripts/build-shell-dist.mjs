#!/usr/bin/env node
/**
 * Production shell dist: static HTML marketing at site root + React SPA under /app/.
 */
import { cpSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellRoot = path.join(repoRoot, "apps", "shell");
const marketingRoot = path.join(shellRoot, "marketing");
const publicRoot = path.join(shellRoot, "public");
const distRoot = path.join(shellRoot, "dist");

function copyMarketing(src, dest) {
  for (const name of readdirSync(src)) {
    if (name === "_partials" || name === "assemble.mjs") continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyMarketing(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

const assemble = spawnSync("node", ["marketing/assemble.mjs"], { cwd: shellRoot, stdio: "inherit" });
if (assemble.status !== 0) process.exit(assemble.status ?? 1);

const vite = spawnSync("pnpm", ["exec", "vite", "build"], { cwd: shellRoot, stdio: "inherit", shell: true });
if (vite.status !== 0) process.exit(vite.status ?? 1);

cpSync(publicRoot, distRoot, { recursive: true });
copyMarketing(marketingRoot, distRoot);

const appHtml = path.join(distRoot, "app", "app.html");
const appIndex = path.join(distRoot, "app", "index.html");
if (statSync(appHtml).isFile()) {
  renameSync(appHtml, appIndex);
}

console.log("dist/ — static HTML marketing (SEO) + dist/app/ React shell");
