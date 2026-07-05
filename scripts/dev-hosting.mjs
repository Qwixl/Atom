#!/usr/bin/env node
/** Local managed-hosting stack: control plane :5300 + isolated hosted agent :5301 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();

const CONTROL_PLANE_URL = "http://127.0.0.1:5300";
const HOSTED_AGENT_URL = "http://127.0.0.1:5301";
const HOSTED_AGENT_TOKEN = "atom-hosted-dev-token";
const hostedDataDir =
  process.env.ATOM_HOSTED_DATA_DIR?.trim() || path.join(home, ".atom-hosted-dev");

const children = [];

async function waitForService(label, url, options = {}) {
  const { maxMs = 60_000, bearerToken } = options;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const headers = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined;
      const resp = await fetch(url, { headers });
      if (resp.ok) {
        console.log(`[hosting] ${label} ready at ${url}`);
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
  console.log(`[hosting] Starting ${label}…`);
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
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

mkdirSync(hostedDataDir, { recursive: true });

spawnService(
  "control-plane",
  "pnpm",
  ["--filter", "@qwixl/control-plane", "dev"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: "5300",
      HOSTED_STUB_AGENT_URL: HOSTED_AGENT_URL,
      HOSTED_STUB_AGENT_TOKEN: HOSTED_AGENT_TOKEN,
    },
  },
);

spawnService(
  "hosted-agent",
  "pnpm",
  ["--filter", "@qwixl/agent-backend", "dev"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: "5301",
      PUBLIC_BASE_URL: HOSTED_AGENT_URL,
      HOST: "127.0.0.1",
      AGENT_NAME: "Atom hosted agent (dev)",
      ATOM_DATA_DIR: hostedDataDir,
      ATOM_ADMIN_TOKEN: HOSTED_AGENT_TOKEN,
      ATOM_SHELL_ORIGINS: "http://localhost:5200,http://127.0.0.1:5200",
    },
  },
);

console.log("");
console.log("Atom managed hosting (local dev)");
console.log(`  control plane:  ${CONTROL_PLANE_URL}`);
console.log(`  hosted agent:   ${HOSTED_AGENT_URL}`);
console.log(`  hosted token:   ${HOSTED_AGENT_TOKEN}`);
console.log(`  hosted data:    ${hostedDataDir}`);
console.log("");
console.log("Leave this terminal open. In the shell wizard choose Create hosted agent.");
console.log("");

try {
  await waitForService("control plane", `${CONTROL_PLANE_URL}/health`);
  await waitForService("hosted agent", `${HOSTED_AGENT_URL}/health`, {
    bearerToken: HOSTED_AGENT_TOKEN,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown();
  process.exit(1);
}
