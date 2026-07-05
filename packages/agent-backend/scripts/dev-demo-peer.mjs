#!/usr/bin/env node
/** Run demo peer agent on :5205 without Docker (Windows-friendly). */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDataDir =
  process.env.ATOM_DEMO_DATA_DIR?.trim() ||
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), ".atom-demo-peer");

const demoToken = process.env.ATOM_ADMIN_TOKEN ?? "atom-demo-peer-token";
const inDemoStack = process.env.ATOM_DEMO_STACK === "1";

if (!inDemoStack) {
  console.log(`Starting Qwixl demo peer on http://127.0.0.1:5205`);
  console.log(`  For the full guided demo, run: pnpm dev:demo (from repo root)`);
  console.log(`  Or pair with your personal agent: pnpm dev:a2a on :5204`);
}

const child = spawn("pnpm", ["exec", "tsx", "watch", "src/cli.ts"], {
  cwd: packageRoot,
  env: {
    ...process.env,
    PORT: "5205",
    HOST: "127.0.0.1",
    PUBLIC_BASE_URL: "http://127.0.0.1:5205",
    ATOM_DEMO_PEER: "1",
    ATOM_ADMIN_TOKEN: demoToken,
    AGENT_NAME: "Qwixl demo peer",
    ATOM_DATA_DIR: demoDataDir,
  },
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
