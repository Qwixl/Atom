#!/usr/bin/env node
/** Personal demo: shell + your agent. See PERSONAL-DEMO.md */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentBackendRoot = path.join(repoRoot, "packages/agent-backend");
const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();

/** Keep in sync with apps/shell/vite.config.ts demo defaults */
const ALICE_URL = "http://127.0.0.1:5204";
const ALICE_TOKEN = "atom-demo-alice-token";
const SHELL_URL = "http://localhost:5200";

const aliceDataDir =
  process.env.ATOM_DEMO_ALICE_DATA_DIR?.trim() || path.join(home, ".atom-demo-alice");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const localEnv = parseEnvFile(path.join(repoRoot, ".env.local"));
Object.assign(process.env, localEnv);

const children = [];

function resetDemoMlsState() {
  mkdirSync(aliceDataDir, { recursive: true });
  const peersFile = path.join(aliceDataDir, "mls-peers.json");
  if (existsSync(peersFile)) {
    unlinkSync(peersFile);
  }
}

async function waitForService(label, url, maxMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        console.log(`[demo] ${label} ready`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function spawnService(label, command, args, options) {
  console.log(`[demo] Starting ${label}…`);
  const child = spawn(command, args, {
    ...options,
    stdio: "inherit",
    shell: true,
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

resetDemoMlsState();

console.log(`
================================================================================
  Atom personal demo

  Open ${SHELL_URL}

  Follow the step-by-step panel on the left:

  1. Add your LLM API key
  2. Paste your private calendar iCal / WebCal link
  3. Ask your agent to schedule a meeting
  4. Confirm — Google Calendar opens with the event prefilled

  Leave this terminal open. Press Ctrl+C to stop all services.
================================================================================
`);

spawnService(
  "Your agent (:5204)",
  "pnpm",
  ["exec", "tsx", "watch", "src/cli.ts"],
  {
    cwd: agentBackendRoot,
    env: {
      ...process.env,
      PORT: "5204",
      HOST: "127.0.0.1",
      PUBLIC_BASE_URL: ALICE_URL,
      ATOM_ADMIN_TOKEN: ALICE_TOKEN,
      ATOM_DATA_DIR: aliceDataDir,
      AGENT_NAME: "Your agent",
    },
  },
);

try {
  await waitForService("Your agent", `${ALICE_URL}/mls/key-package`);
} catch (error) {
  console.error(`[demo] ${error instanceof Error ? error.message : String(error)}`);
  shutdown();
}

spawnService("Atom app (:5200)", "pnpm", ["--filter", "@qwixl/shell-app", "dev"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VITE_DEMO_MODE: "1",
    VITE_DEMO_ALICE_URL: ALICE_URL,
    VITE_DEMO_ALICE_TOKEN: ALICE_TOKEN,
    VITE_DEMO_PERSONAL_AGENT_URL: ALICE_URL,
    VITE_DEMO_PERSONAL_AGENT_TOKEN: ALICE_TOKEN,
  },
});
