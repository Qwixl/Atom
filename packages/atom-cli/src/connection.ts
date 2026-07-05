import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlatformUrl } from "./platform.js";

export interface AgentConnection {
  url: string;
  token: string;
  did?: string;
  agentName?: string;
  handle?: string;
  platformUrl?: string;
}

export function defaultDataDir(): string {
  if (process.env.ATOM_DATA_DIR?.trim()) return process.env.ATOM_DATA_DIR.trim();
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), ".atom");
}

export function findMonorepoRoot(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const fromPackage = path.resolve(packageRoot, "../..");
  if (existsSync(path.join(fromPackage, "pnpm-workspace.yaml"))) return fromPackage;
  return null;
}

async function readTokenFile(dataDir: string): Promise<string | undefined> {
  try {
    const token = (await readFile(path.join(dataDir, "agent-admin-token.txt"), "utf8")).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export async function loadAgentConnection(): Promise<AgentConnection> {
  const dataDir = defaultDataDir();
  const connectionPath = path.join(dataDir, "agent-connection.json");
  try {
    const raw = JSON.parse(await readFile(connectionPath, "utf8")) as Partial<AgentConnection>;
    const url = raw.url?.trim().replace(/\/$/, "");
    const token = raw.token?.trim();
    if (url && token) {
      return {
        url,
        token,
        did: raw.did?.trim() || undefined,
        agentName: raw.agentName?.trim() || undefined,
        handle: raw.handle?.trim() || undefined,
        platformUrl: raw.platformUrl?.trim().replace(/\/$/, "") || resolvePlatformUrl(),
      };
    }
  } catch {
    /* fall through */
  }

  const token =
    process.env.ATOM_ADMIN_TOKEN?.trim() ||
    (await readTokenFile(dataDir)) ||
    (() => {
      throw new Error(
        `No agent credentials found. Run \`atom serve\` first, or set ATOM_ADMIN_TOKEN. Expected ${connectionPath}`,
      );
    })();

  const url = (
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.ATOM_AGENT_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || "5204"}`
  ).replace(/\/$/, "");

  return { url, token, platformUrl: resolvePlatformUrl() };
}

export async function saveAgentConnection(connection: AgentConnection): Promise<string> {
  const filePath = path.join(defaultDataDir(), "agent-connection.json");
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = {
    version: 1 as const,
    url: connection.url.replace(/\/$/, ""),
    token: connection.token,
    did: connection.did,
    agentName: connection.agentName,
    handle: connection.handle,
    platformUrl: connection.platformUrl?.replace(/\/$/, "") || resolvePlatformUrl(),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}

export async function adminFetch(
  connection: AgentConnection,
  requestPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${connection.url}${requestPath.startsWith("/") ? requestPath : `/${requestPath}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${connection.token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}

export async function adminJson<T>(
  connection: AgentConnection,
  requestPath: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await adminFetch(connection, requestPath, init);
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : text || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }
  return payload as T;
}
