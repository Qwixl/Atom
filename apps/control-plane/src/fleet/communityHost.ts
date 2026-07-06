import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assertProductionAgentPublicUrl } from "./publicUrl.js";

const execFileAsync = promisify(execFile);

const AGENT_CONTAINER_PORT = 5204;
const COMMUNITY_CONTAINER = "atom-community-host";

export interface CommunityHostRecord {
  containerName: string;
  hostPort: number;
  adminToken: string;
  publicUrl: string;
}

function communityPort(): number {
  return Number(process.env.ATOM_FLEET_COMMUNITY_PORT ?? 5305);
}

function agentImage(): string {
  return process.env.ATOM_AGENT_IMAGE?.trim() || "atom-agent:latest";
}

function shellOrigins(): string {
  return (
    process.env.ATOM_SHELL_ORIGINS?.trim() ||
    "http://localhost:5200,http://127.0.0.1:5200,https://atom.qwixl.com"
  );
}

function communityPublicUrl(port: number): string {
  const explicit = process.env.ATOM_COMMUNITY_HOST_URL?.trim();
  if (explicit) {
    assertProductionAgentPublicUrl(explicit);
    return explicit.replace(/\/$/, "");
  }
  const template = process.env.ATOM_FLEET_PUBLIC_URL_TEMPLATE?.trim();
  const url = template
    ? template.replace("{port}", String(port))
    : `http://${process.env.ATOM_FLEET_PUBLIC_HOST?.trim() || "127.0.0.1"}:${port}`;
  assertProductionAgentPublicUrl(url);
  return url.replace(/\/$/, "");
}

function recordPath(dataDir: string): string {
  return path.join(dataDir, "community-host.json");
}

function loadRecord(dataDir: string): CommunityHostRecord | null {
  const file = recordPath(dataDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CommunityHostRecord;
  } catch {
    return null;
  }
}

function saveRecord(dataDir: string, record: CommunityHostRecord): void {
  writeFileSync(recordPath(dataDir), JSON.stringify(record, null, 2), "utf8");
}

async function docker(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { encoding: "utf8" });
  return stdout.trim();
}

function internalHealthUrl(hostPort: number): string {
  const host = process.env.ATOM_FLEET_HEALTH_HOST?.trim() || "host.docker.internal";
  return `http://${host}:${hostPort}`;
}

async function waitForHealth(hostPort: number, adminToken: string, maxMs = 120_000): Promise<void> {
  const base = internalHealthUrl(hostPort);
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(`${base}/health`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resp.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Community host did not become healthy at ${base}`);
}

function dockerRunArgs(input: {
  hostPort: number;
  adminToken: string;
  publicUrl: string;
}): string[] {
  return [
    "run",
    "-d",
    "--name",
    COMMUNITY_CONTAINER,
    "--label",
    "atom.fleet=community-host",
    "-p",
    `${input.hostPort}:${AGENT_CONTAINER_PORT}`,
    "-v",
    `${COMMUNITY_CONTAINER}-data:/data`,
    "-e",
    `ATOM_ADMIN_TOKEN=${input.adminToken}`,
    "-e",
    `PUBLIC_BASE_URL=${input.publicUrl}`,
    "-e",
    "AGENT_NAME=Qwixl Coffee Shop",
    "-e",
    "ATOM_COMMUNITY_HOST=1",
    "-e",
    "ATOM_COFFEE_SHOP=1",
    "-e",
    "ATOM_BUSINESS_DOMAIN=coffee-shop.agents.qwixl.dev",
    "-e",
    `ATOM_SHELL_ORIGINS=${shellOrigins()}`,
    "-e",
    "HOST=0.0.0.0",
    "-e",
    `PORT=${AGENT_CONTAINER_PORT}`,
    "-e",
    "ATOM_DATA_DIR=/data",
    agentImage(),
  ];
}

/** Public URL for the shared Coffee Shop community host (null when fleet is not docker-configured). */
export function resolveCommunityHostPublicUrl(): string | null {
  if (process.env.ATOM_FLEET_MODE?.trim().toLowerCase() !== "docker") return null;
  try {
    return communityPublicUrl(communityPort());
  } catch {
    return process.env.ATOM_COMMUNITY_HOST_URL?.trim().replace(/\/$/, "") ?? null;
  }
}

/** Reserved host port — exclude from per-user fleet allocation. */
export function reservedCommunityHostPort(): number | null {
  if (process.env.ATOM_FLEET_MODE?.trim().toLowerCase() !== "docker") return null;
  return communityPort();
}

/** Idempotent: start or verify the shared community host container. */
export async function ensureCommunityHost(dataDir: string): Promise<CommunityHostRecord | null> {
  if (process.env.ATOM_FLEET_MODE?.trim().toLowerCase() !== "docker") return null;
  if (process.env.ATOM_SKIP_COMMUNITY_HOST === "1" || process.env.ATOM_SKIP_COMMUNITY_HOST === "true") {
    return null;
  }

  const hostPort = communityPort();
  const publicUrl = communityPublicUrl(hostPort);
  let record = loadRecord(dataDir);

  if (!record || record.hostPort !== hostPort || record.publicUrl !== publicUrl) {
    record = {
      containerName: COMMUNITY_CONTAINER,
      hostPort,
      adminToken: record?.adminToken ?? randomBytes(32).toString("base64url"),
      publicUrl,
    };
    saveRecord(dataDir, record);
  }

  try {
    const status = await docker(["inspect", "-f", "{{.State.Running}}", COMMUNITY_CONTAINER]);
    if (status === "true") {
      await waitForHealth(record.hostPort, record.adminToken, 15_000);
      return record;
    }
  } catch {
    /* container missing — create below */
  }

  await docker(["rm", "-f", COMMUNITY_CONTAINER]).catch(() => undefined);
  await docker(dockerRunArgs({ hostPort, adminToken: record.adminToken, publicUrl }));
  await waitForHealth(record.hostPort, record.adminToken);
  console.log(`[fleet] Community host ready at ${publicUrl}`);
  return record;
}
