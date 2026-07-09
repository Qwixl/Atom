#!/usr/bin/env node
/**
 * Fail CI if the shell web app contains localhost URLs or dev CLI copy outside allowlisted paths.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellSrc = path.join(repoRoot, "apps", "shell", "src");

const LOCALHOST_RE = /127\.0\.0\.1|localhost:\d+|http:\/\/localhost/i;
const DEV_CLI_RE = /\bpnpm dev[:-\w]*/i;
const PLAN_ID_RE = /\([MD]\d{2,3}\.\d+\)|\b[MD]\d{2,3}\.\d+\b/;

const LOCALHOST_FILE_ALLOW = new Set([
  "hostConfig.ts",
  "devAgentProbe.ts",
  "comms/storage.ts",
  "comms/types.ts",
  "comms/client.ts",
  "productionGuard.ts",
  "FirstRunWizard.tsx",
  "demoPersonas.ts",
]);

const DEV_CLI_FILE_ALLOW = new Set([
  "FirstRunWizard.tsx",
  "DemoBootstrap.tsx",
  "PersonalDemoWalkthrough.tsx",
  "demoPersonas.ts",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function lineAllowedForLocalhost(line, rel) {
  if (LOCALHOST_FILE_ALLOW.has(rel)) return true;
  if (line.includes("resolveInjectedUrl(")) return true;
  if (line.includes("DEFAULT_AGUI_URL") || line.includes("DEFAULT_COMMS_AGENT_URL")) return true;
  return false;
}

function lineAllowedForDevCli(line, rel, fileText) {
  if (DEV_CLI_FILE_ALLOW.has(rel)) return true;
  if (fileText.includes("SHOW_DEV_WORKFLOWS")) return true;
  if (line.includes("SHOW_DEV_WORKFLOWS")) return true;
  return false;
}

const errors = [];

for (const file of walk(shellSrc)) {
  const rel = path.relative(shellSrc, file).replace(/\\/g, "/");
  if (/\.test\.(ts|tsx)$/.test(rel) || /\.spec\.(ts|tsx)$/.test(rel)) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (LOCALHOST_RE.test(line) && !lineAllowedForLocalhost(line, rel)) {
      errors.push(`${rel}:${i + 1}: localhost reference`);
    }
    if (DEV_CLI_RE.test(line) && !lineAllowedForDevCli(line, rel, text)) {
      errors.push(`${rel}:${i + 1}: pnpm dev* copy`);
    }
    // SVG path `d` attributes use move commands like M33.07 — not plan ids.
    if (
      PLAN_ID_RE.test(line) &&
      !/^\s*(\/\/|\/\*|\*)/.test(line) &&
      !line.includes('path d="') &&
      !/<path\b/.test(line)
    ) {
      errors.push(`${rel}:${i + 1}: internal plan id (M## / D##)`);
    }
  }
}

if (errors.length > 0) {
  console.error("Production shell verification failed:\n");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log("Production shell verification passed.");
