#!/usr/bin/env node
/** Community host for Discover → Join room (Qwixl Coffee Shop on :5207). */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir =
  process.env.ATOM_COFFEE_SHOP_DATA_DIR?.trim() ||
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), ".atom-coffee-shop");

const adminToken = process.env.ATOM_ADMIN_TOKEN ?? "atom-coffee-shop-token";

console.log(`Starting Qwixl Coffee Shop community host on http://127.0.0.1:5207`);
console.log(`  Discover panel: Community index → Join room / Connect (MLS)`);
console.log(`  Pair with your agent: pnpm dev:a2a on :5204`);

const child = spawn("pnpm", ["exec", "tsx", "watch", "src/cli.ts"], {
  cwd: packageRoot,
  env: {
    ...process.env,
    PORT: "5207",
    HOST: "127.0.0.1",
    PUBLIC_BASE_URL: "http://127.0.0.1:5207",
    ATOM_COMMUNITY_HOST: "1",
    ATOM_ADMIN_TOKEN: adminToken,
    AGENT_NAME: "Qwixl Coffee Shop",
    ATOM_DATA_DIR: dataDir,
  },
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
