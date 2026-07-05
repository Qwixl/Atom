import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HostedAgentRecord } from "./types.js";

const STORE_FILE = "hosted-agents.json";

function storePath(dataDir: string): string {
  return path.join(dataDir, STORE_FILE);
}

export async function loadAgentStore(dataDir: string): Promise<Map<string, HostedAgentRecord>> {
  await mkdir(dataDir, { recursive: true });
  try {
    const raw = await readFile(storePath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as HostedAgentRecord[];
    return new Map(parsed.map((agent) => [agent.id, agent]));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
}

export async function saveAgentStore(dataDir: string, agents: Map<string, HostedAgentRecord>): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const payload = [...agents.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await writeFile(storePath(dataDir), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export function resolveDataDir(): string {
  const configured = process.env.ATOM_CONTROL_PLANE_DATA_DIR?.trim();
  if (configured) return configured;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ".";
  return path.join(home, ".atom-control-plane");
}
