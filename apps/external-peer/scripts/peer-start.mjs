#!/usr/bin/env node
/**
 * Run a reference Atom network peer (not an owner portal / demo scheduling peer).
 * Your powerful agent stays outside; this process is the A2A/MLS wire adapter.
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT?.trim() || "5211";
const host = process.env.HOST?.trim() || "127.0.0.1";
const publicBase =
  process.env.PUBLIC_BASE_URL?.trim() || `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
const token = process.env.ATOM_ADMIN_TOKEN?.trim() || "atom-external-peer-token";
const dataDir =
  process.env.ATOM_DATA_DIR?.trim() ||
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), ".atom-external-peer");

console.log(`Starting Atom external peer on ${publicBase}`);
console.log(`  Admin token: ${token}`);
console.log(`  Data dir:    ${dataDir}`);
console.log(`  Guide:       JOIN-AS-PEER.md (repo root)`);
console.log(`  Pair from an owner agent: POST /mls/connect { peerUrl: "${publicBase}/a2a/jsonrpc" }`);

const child = spawn("pnpm", ["exec", "tsx", "watch", "src/index.ts"], {
  cwd: appRoot,
  env: {
    ...process.env,
    PORT: port,
    HOST: host,
    PUBLIC_BASE_URL: publicBase,
    ATOM_ADMIN_TOKEN: token,
    AGENT_NAME: process.env.AGENT_NAME?.trim() || "External peer",
    ATOM_DATA_DIR: dataDir,
    // Explicitly not a demo scheduling counterpart.
    ATOM_DEMO_PEER: process.env.ATOM_DEMO_PEER?.trim() || "0",
  },
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
