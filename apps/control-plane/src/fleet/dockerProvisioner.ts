import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { FleetProvisioner, HostedAgentRecord, ProvisionOutcome } from "./types.js";
import { assertProductionAgentPublicUrl } from "./publicUrl.js";
import { reservedCommunityHostPort, resolveCommunityHostPublicUrl } from "./communityHost.js";
import { resolveHostedBrainAlwaysOn } from "./brainAlwaysOn.js";

const execFileAsync = promisify(execFile);

const AGENT_CONTAINER_PORT = 5204;
const PORT_BASE = Number(process.env.ATOM_FLEET_PORT_BASE ?? 5310);
const PORT_MAX = Number(process.env.ATOM_FLEET_PORT_MAX ?? 5399);

function shellOrigins(): string {
  return (
    process.env.ATOM_SHELL_ORIGINS?.trim() ||
    "http://localhost:5200,http://127.0.0.1:5200,https://atom.qwixl.com"
  );
}

function agentImage(): string {
  return process.env.ATOM_AGENT_IMAGE?.trim() || "atom-agent:latest";
}

function publicBaseUrl(port: number): string {
  const template = process.env.ATOM_FLEET_PUBLIC_URL_TEMPLATE?.trim();
  const url = template
    ? template.replace("{port}", String(port))
    : `http://${process.env.ATOM_FLEET_PUBLIC_HOST?.trim() || "127.0.0.1"}:${port}`;
  assertProductionAgentPublicUrl(url);
  return url;
}

function allocatePort(usedPorts: Set<number>): number {
  const reserved = reservedCommunityHostPort();
  for (let port = PORT_BASE; port <= PORT_MAX; port += 1) {
    if (port === reserved) continue;
    if (!usedPorts.has(port)) return port;
  }
  throw new Error("No fleet ports available — increase ATOM_FLEET_PORT_MAX");
}

function collectUsedPorts(agents: Iterable<HostedAgentRecord>): Set<number> {
  const used = new Set<number>();
  for (const agent of agents) {
    if (agent.hostPort) used.add(agent.hostPort);
  }
  return used;
}

/** Host ports bound by fleet containers (includes orphans not in the agent store). */
async function dockerHostPortsInUse(): Promise<Set<number>> {
  const used = new Set<number>();
  try {
    const stdout = await docker([
      "ps",
      "-a",
      "--filter",
      "label=atom.fleet=hosted-agent",
      "--format",
      "{{.Ports}}",
    ]);
    for (const line of stdout.split("\n")) {
      for (const match of line.matchAll(/:(\d+)->\d+\/tcp/g)) {
        used.add(Number(match[1]));
      }
    }
  } catch {
    /* best effort */
  }
  return used;
}

async function allocateHostPort(agents: Iterable<HostedAgentRecord>): Promise<number> {
  const used = collectUsedPorts(agents);
  for (const port of await dockerHostPortsInUse()) {
    used.add(port);
  }
  return allocatePort(used);
}

async function docker(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { encoding: "utf8" });
  return stdout.trim();
}

function dockerRunArgs(input: {
  containerName: string;
  hostPort: number;
  adminToken: string;
  agentUrl: string;
  handle: string;
  agentId: string;
  llmApiKey?: string;
  workspaceKind?: "personal" | "business" | "developer";
  brainAlwaysOn?: boolean;
}): string[] {
  const workspaceKind = input.workspaceKind ?? "personal";
  const brainAlwaysOn = input.brainAlwaysOn ?? resolveHostedBrainAlwaysOn();
  const runArgs = [
    "run",
    "-d",
    "--name",
    input.containerName,
    "--label",
    "atom.fleet=hosted-agent",
    "--label",
    `atom.agent.id=${input.agentId}`,
    "-p",
    `${input.hostPort}:${AGENT_CONTAINER_PORT}`,
    "-v",
    `${input.containerName}-data:/data`,
    "-e",
    `ATOM_ADMIN_TOKEN=${input.adminToken}`,
    "-e",
    `PUBLIC_BASE_URL=${input.agentUrl}`,
    "-e",
    `AGENT_NAME=Atom agent (${input.handle})`,
    "-e",
    `ATOM_SHELL_ORIGINS=${shellOrigins()}`,
    "-e",
    "HOST=0.0.0.0",
    "-e",
    `PORT=${AGENT_CONTAINER_PORT}`,
    "-e",
    "ATOM_DATA_DIR=/data",
    "-e",
    `ATOM_WORKSPACE_KIND=${workspaceKind}`,
    "-e",
    `ATOM_BRAIN_ALWAYS_ON=${brainAlwaysOn ? "1" : "0"}`,
    agentImage(),
  ];
  if (workspaceKind === "business") {
    runArgs.splice(runArgs.length - 1, 0, "-e", "ATOM_BUSINESS_MODE=true");
  }
  if (input.llmApiKey?.trim()) {
    runArgs.splice(runArgs.length - 1, 0, "-e", `LLM_API_KEY=${input.llmApiKey.trim()}`);
  }
  const communityUrl = resolveCommunityHostPublicUrl();
  if (communityUrl) {
    runArgs.splice(runArgs.length - 1, 0, "-e", `ATOM_COMMUNITY_HOST_URL=${communityUrl}`);
  }
  return runArgs;
}

export class DockerFleetProvisioner implements FleetProvisioner {
  readonly mode = "docker" as const;

  constructor(private readonly agents: Map<string, HostedAgentRecord>) {}

  async provision(input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
    workspaceKind?: "personal" | "business" | "developer";
    brainAlwaysOn?: boolean;
  }): Promise<ProvisionOutcome> {
    const adminToken = randomBytes(32).toString("base64url");
    const hostPort = await allocateHostPort(this.agents.values());
    const containerName = `atom-hosted-${input.handle}-${input.id.slice(0, 8)}`;
    const agentUrl = publicBaseUrl(hostPort).replace(/\/$/, "");

    const runArgs = dockerRunArgs({
      containerName,
      hostPort,
      adminToken,
      agentUrl,
      handle: input.handle,
      agentId: input.id,
      llmApiKey: input.llmApiKey,
      workspaceKind: input.workspaceKind,
      brainAlwaysOn: input.brainAlwaysOn ?? resolveHostedBrainAlwaysOn(),
    });

    try {
      const containerId = await docker(runArgs);
      await waitForAgentHealth(internalHealthUrl(hostPort), adminToken);

      const agent: HostedAgentRecord = {
        id: input.id,
        handle: input.handle,
        email: input.email,
        agentUrl,
        adminToken,
        status: "active",
        createdAt: new Date().toISOString(),
        fleetMode: "docker",
        containerId,
        containerName,
        hostPort,
      };

      return {
        agent,
        status: "provisioned",
        message: "Your agent is running in an isolated container with its own encrypted volume.",
      };
    } catch (error) {
      await docker(["rm", "-f", containerName]).catch(() => undefined);
      throw error;
    }
  }

  async suspend(agent: HostedAgentRecord, _reason: string): Promise<void> {
    if (!agent.containerName) return;
    await docker(["stop", agent.containerName]);
  }

  async resume(agent: HostedAgentRecord): Promise<void> {
    if (!agent.containerName) return;
    await docker(["start", agent.containerName]);
    await waitForAgentHealth(internalHealthUrl(agent.hostPort ?? AGENT_CONTAINER_PORT), agent.adminToken);
  }

  async destroy(agent: HostedAgentRecord): Promise<void> {
    if (!agent.containerName) return;
    await docker(["rm", "-f", agent.containerName]).catch(() => undefined);
    await docker(["volume", "rm", `${agent.containerName}-data`]).catch(() => undefined);
  }

  async updateLlmApiKey(agent: HostedAgentRecord, llmApiKey: string): Promise<void> {
    const key = llmApiKey.trim();
    if (!key) throw new Error("LLM API key is required");
    if (!agent.containerName || agent.hostPort == null) {
      throw new Error("Agent container metadata missing");
    }
    await docker(["rm", "-f", agent.containerName]).catch(() => undefined);
    const containerId = await docker(
      dockerRunArgs({
        containerName: agent.containerName,
        hostPort: agent.hostPort,
        adminToken: agent.adminToken,
        agentUrl: agent.agentUrl,
        handle: agent.handle,
        agentId: agent.id,
        llmApiKey: key,
        brainAlwaysOn: resolveHostedBrainAlwaysOn(),
      }),
    );
    agent.containerId = containerId;
    await waitForAgentHealth(internalHealthUrl(agent.hostPort), agent.adminToken);
  }
}

/** Reach agent on the Docker host loopback (control plane runs in a container). */
function internalHealthUrl(hostPort: number): string {
  const host = process.env.ATOM_FLEET_HEALTH_HOST?.trim() || "host.docker.internal";
  return `http://${host}:${hostPort}`;
}

async function waitForAgentHealth(healthBaseUrl: string, adminToken: string, maxMs = 90_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(`${healthBaseUrl.replace(/\/$/, "")}/health`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resp.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Provisioned agent did not become healthy at ${healthBaseUrl}`);
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker(["info"]);
    return true;
  } catch {
    return false;
  }
}
