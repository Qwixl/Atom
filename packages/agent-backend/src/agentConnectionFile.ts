import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";

export const AGENT_CONNECTION_FILE = "agent-connection.json";

export interface AgentConnectionRecord {
  version: 1;
  url: string;
  token: string;
  did: string;
  agentName: string;
  platformUrl?: string;
  updatedAt: string;
}

export function agentConnectionPath(): string {
  return resolveDataPath(AGENT_CONNECTION_FILE);
}

export async function writeAgentConnectionFile(input: {
  url: string;
  token: string;
  did: string;
  agentName: string;
}): Promise<void> {
  const filePath = agentConnectionPath();
  const payload: AgentConnectionRecord = {
    version: 1,
    url: input.url.replace(/\/$/, ""),
    token: input.token,
    did: input.did,
    agentName: input.agentName,
    ...(process.env.ATOM_PLATFORM_URL?.trim()
      ? { platformUrl: process.env.ATOM_PLATFORM_URL.trim().replace(/\/$/, "") }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}
