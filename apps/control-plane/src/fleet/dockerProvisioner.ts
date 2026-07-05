import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { FleetProvisioner, HostedAgentRecord, ProvisionOutcome } from "./types.js";
import { assertProductionAgentPublicUrl } from "./publicUrl.js";

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

function allocatePort(agents: Iterable<HostedAgentRecord>): number {
  const used = new Set<number>();
  for (const agent of agents) {
    if (agent.hostPort) used.add(agent.hostPort);
  }
  for (let port = PORT_BASE; port <= PORT_MAX; port += 1) {
    if (!used.has(port)) return port;
  }
  throw new Error("No fleet ports available — increase ATOM_FLEET_PORT_MAX");
}

async function docker(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { encoding: "utf8" });
  return stdout.trim();
}

export class DockerFleetProvisioner implements FleetProvisioner {
  readonly mode = "docker" as const;

  constructor(private readonly agents: Map<string, HostedAgentRecord>) {}

  async provision(input: { id: string; handle: string; email: string }): Promise<ProvisionOutcome> {
    const adminToken = randomBytes(32).toString("base64url");
    const hostPort = allocatePort(this.agents.values());
    const containerName = `atom-hosted-${input.handle}-${input.id.slice(0, 8)}`;
    const agentUrl = publicBaseUrl(hostPort).replace(/\/$/, "");

    const runArgs = [
      "run",
      "-d",
      "--name",
      containerName,
      "--label",
      "atom.fleet=hosted-agent",
      "--label",
      `atom.agent.id=${input.id}`,
      "-p",
      `${hostPort}:${AGENT_CONTAINER_PORT}`,
      "-v",
      `${containerName}-data:/data`,
      "-e",
      `ATOM_ADMIN_TOKEN=${adminToken}`,
      "-e",
      `PUBLIC_BASE_URL=${agentUrl}`,
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
      agentImage(),
    ];

    const containerId = await docker(runArgs);
    await waitForAgentHealth(agentUrl, adminToken);

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
  }

  async suspend(agent: HostedAgentRecord, _reason: string): Promise<void> {
    if (!agent.containerName) return;
    await docker(["stop", agent.containerName]);
  }

  async resume(agent: HostedAgentRecord): Promise<void> {
    if (!agent.containerName) return;
    await docker(["start", agent.containerName]);
    await waitForAgentHealth(agent.agentUrl, agent.adminToken);
  }

  async destroy(agent: HostedAgentRecord): Promise<void> {
    if (!agent.containerName) return;
    await docker(["rm", "-f", agent.containerName]).catch(() => undefined);
    await docker(["volume", "rm", `${agent.containerName}-data`]).catch(() => undefined);
  }
}

async function waitForAgentHealth(agentUrl: string, adminToken: string, maxMs = 90_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(`${agentUrl.replace(/\/$/, "")}/health`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (resp.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Provisioned agent did not become healthy at ${agentUrl}`);
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker(["info"]);
    return true;
  } catch {
    return false;
  }
}
