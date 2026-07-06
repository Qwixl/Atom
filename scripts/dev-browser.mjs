#!/usr/bin/env node
/**
 * Browser mode — one command: your agent + Atom UI.
 * Open http://localhost:5200 — no separate terminal, no ports or tokens in the UI.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentBackendRoot = path.join(repoRoot, "packages/agent-backend");
const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();

const INTERNAL_AGENT_PORT = "5204";
const INTERNAL_AGENT_URL = `http://127.0.0.1:${INTERNAL_AGENT_PORT}`;
const DEMO_PEER_PORT = "5205";
const DEMO_PEER_URL = `http://127.0.0.1:${DEMO_PEER_PORT}`;
const HOSTED_STUB_PORT = "5301";
const HOSTED_STUB_URL = `http://127.0.0.1:${HOSTED_STUB_PORT}`;
const HOSTED_STUB_TOKEN = "atom-hosted-dev-token";
const CONTROL_PLANE_URL = "http://127.0.0.1:5300";
const DEMO_PEER_TOKEN = "atom-demo-peer-token";
const BROWSER_AGENT_TOKEN = process.env.ATOM_BROWSER_TOKEN?.trim() || "atom-browser-dev-token";
const AGENT_API_PATH = "/agent-api";
const SHELL_URL = "http://localhost:5200";
const browserDataDir =
  process.env.ATOM_BROWSER_DATA_DIR?.trim() || path.join(home, ".atom-browser-dev");

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

Object.assign(process.env, parseEnvFile(path.join(repoRoot, ".env.local")));

const children = [];

async function waitForAgent(url, maxMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(`${url.replace(/\/$/, "")}/discover/capabilities`);
      if (resp.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Agent did not start at ${url}`);
}

function spawnService(label, command, args, options) {
  console.log(`[atom] ${label}`);
  const child = spawn(command, args, { ...options, stdio: "inherit", shell: true });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const hostedStubDataDir =
  process.env.ATOM_HOSTED_DATA_DIR?.trim() || path.join(home, ".atom-hosted-dev");

mkdirSync(hostedStubDataDir, { recursive: true });

const communityHost = process.env.ATOM_COMMUNITY_HOST === "1" || process.env.ATOM_COMMUNITY_HOST === "true";

console.log(`
================================================================================
  Atom (browser mode)

  Opening ${SHELL_URL}  (marketing — static HTML, SEO-friendly)
  App shell: ${SHELL_URL}/app/
  Live demo: ${SHELL_URL}/demo/  →  Start demo opens ${SHELL_URL}/app/?demo=1

  Press Ctrl+C here to stop.
================================================================================
`);

spawnService(
  "Starting your agent…",
  "pnpm",
  ["exec", "tsx", "watch", "src/cli.ts"],
  {
    cwd: agentBackendRoot,
    env: {
      ...process.env,
      PORT: INTERNAL_AGENT_PORT,
      HOST: "127.0.0.1",
      PUBLIC_BASE_URL: INTERNAL_AGENT_URL,
      ATOM_ADMIN_TOKEN: BROWSER_AGENT_TOKEN,
      ATOM_DATA_DIR: browserDataDir,
      ATOM_COMMUNITY_HOST: communityHost ? "1" : "",
      AGENT_NAME: "Your agent",
      ATOM_SHELL_ORIGINS: `${SHELL_URL},http://127.0.0.1:5200`,
    },
  },
);

try {
  await waitForAgent(INTERNAL_AGENT_URL);
} catch (error) {
  console.error(`[atom] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
}

const demoPeerDataDir =
  process.env.ATOM_DEMO_DATA_DIR?.trim() ||
  path.join(home, ".atom-demo-peer");

spawnService(
  "Starting demo business peer…",
  "pnpm",
  ["exec", "tsx", "watch", "src/cli.ts"],
  {
    cwd: agentBackendRoot,
    env: {
      ...process.env,
      PORT: DEMO_PEER_PORT,
      HOST: "127.0.0.1",
      PUBLIC_BASE_URL: DEMO_PEER_URL,
      ATOM_DEMO_PEER: "1",
      ATOM_ADMIN_TOKEN: DEMO_PEER_TOKEN,
      AGENT_NAME: "Qwixl demo peer",
      ATOM_DATA_DIR: demoPeerDataDir,
      ATOM_SHELL_ORIGINS: `${SHELL_URL},http://127.0.0.1:5200`,
    },
  },
);

try {
  await waitForAgent(DEMO_PEER_URL);
} catch (error) {
  console.warn(`[atom] Demo peer did not start: ${error instanceof Error ? error.message : String(error)}`);
}

spawnService(
  "Starting hosted stub agent…",
  "pnpm",
  ["--filter", "@qwixl/agent-backend", "dev"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: HOSTED_STUB_PORT,
      PUBLIC_BASE_URL: HOSTED_STUB_URL,
      HOST: "127.0.0.1",
      AGENT_NAME: "Atom hosted agent (dev stub)",
      ATOM_DATA_DIR: hostedStubDataDir,
      ATOM_ADMIN_TOKEN: HOSTED_STUB_TOKEN,
      ATOM_SHELL_ORIGINS: `${SHELL_URL},http://127.0.0.1:5200`,
    },
  },
);

spawnService(
  "Starting control plane…",
  "pnpm",
  ["--filter", "@qwixl/control-plane", "dev"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: "5300",
      HOSTED_STUB_AGENT_URL: HOSTED_STUB_URL,
      HOSTED_STUB_AGENT_TOKEN: HOSTED_STUB_TOKEN,
    },
  },
);

try {
  await waitForAgent(HOSTED_STUB_URL);
} catch (error) {
  console.warn(`[atom] Hosted stub did not start: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const cpStarted = Date.now();
  while (Date.now() - cpStarted < 60_000) {
    try {
      const resp = await fetch(`${CONTROL_PLANE_URL}/health`);
      if (resp.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
} catch (error) {
  console.warn(`[atom] Control plane did not start: ${error instanceof Error ? error.message : String(error)}`);
}

spawnService("Starting Atom…", "pnpm", ["--filter", "@qwixl/shell-app", "dev"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VITE_ATOM_BROWSER_MODE: "1",
    VITE_ATOM_AGENT_API: AGENT_API_PATH,
    VITE_ATOM_AGENT_TOKEN: BROWSER_AGENT_TOKEN,
    VITE_ATOM_INTERNAL_AGENT_PORT: INTERNAL_AGENT_PORT,
    VITE_DEMO_PEER_URL: DEMO_PEER_URL,
    VITE_DEMO_PEER_TOKEN: DEMO_PEER_TOKEN,
  },
});
