#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOperatorEnvFiles } from "./loadOperatorEnv.js";
import { startAgentServer } from "./server.js";

loadOperatorEnvFiles();

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
) as { version: string };

function usage(): never {
  console.log(`atom-agent — owner-controlled Atom agent backend (A2A + MLS E2E)

Usage:
  atom-agent [--help]

Environment:
  PORT                  Listen port (default 5204; auto-bumps if taken unless ATOM_PORT_PROMPT=1)
  HOST                  Bind address (default 127.0.0.1; use 0.0.0.0 in Docker)
  PUBLIC_BASE_URL       Public URL for agent card + invitations (default http://HOST:PORT)
  AGENT_NAME            Human-readable agent label (default "Atom agent")
  ATOM_DATA_DIR         Directory for identity + future persisted state (default ~/.atom)
  ATOM_AGENT_IDENTITY_PATH  Override identity file path
  ATOM_SHELL_ORIGINS    Comma-separated extra CORS origins for shell admin API

Shell setup:
  Open Comms in the reference shell and set "My agent" to PUBLIC_BASE_URL (admin API).

Docs: https://github.com/Qwixl/Atom/blob/main/AGENT-BACKEND.md
`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();
if (args.includes("--version") || args.includes("-v")) {
  console.log(version.version);
  process.exit(0);
}

startAgentServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
