import { randomBytes } from "node:crypto";
import type { FleetProvisioner, HostedAgentRecord, ProvisionOutcome } from "./types.js";
import { DockerFleetProvisioner, isDockerAvailable } from "./dockerProvisioner.js";
import { ensureCommunityHost, resolveCommunityHostPublicUrl } from "./communityHost.js";

function devStubCredentials(): { agentUrl: string; adminToken: string } | null {
  const agentUrl = process.env.HOSTED_STUB_AGENT_URL?.trim();
  const adminToken = process.env.HOSTED_STUB_AGENT_TOKEN?.trim();
  if (agentUrl && adminToken) return { agentUrl, adminToken };
  return null;
}

class DevStubProvisioner implements FleetProvisioner {
  readonly mode = "dev-stub" as const;

  async provision(input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
  }): Promise<ProvisionOutcome> {
    const stub = devStubCredentials();
    if (!stub) {
      throw new Error("Dev stub credentials not configured");
    }
    const agent: HostedAgentRecord = {
      id: input.id,
      handle: input.handle,
      email: input.email,
      agentUrl: stub.agentUrl.replace(/\/$/, ""),
      adminToken: stub.adminToken,
      status: "active",
      createdAt: new Date().toISOString(),
      fleetMode: "dev-stub",
    };
    return {
      agent,
      status: "provisioned-dev",
      message:
        "Local dev stack: agent runs on the configured HOSTED_STUB_AGENT_URL. Production uses isolated Docker containers per owner.",
    };
  }

  async suspend(_agent: HostedAgentRecord, _reason: string): Promise<void> {
    /* dev stub — no container lifecycle */
  }

  async resume(_agent: HostedAgentRecord): Promise<void> {
    /* dev stub */
  }

  async destroy(_agent: HostedAgentRecord): Promise<void> {
    /* dev stub */
  }

  async updateLlmApiKey(_agent: HostedAgentRecord, _llmApiKey: string): Promise<void> {
    /* dev stub — LLM key lives on the shared stub agent process */
  }
}

class UnconfiguredProvisioner implements FleetProvisioner {
  readonly mode = "unconfigured" as const;

  async provision(_input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
  }): Promise<ProvisionOutcome> {
    throw new Error(
      "Hosted signup is unavailable: fleet not configured. Set ATOM_FLEET_MODE=docker and build atom-agent:latest, or self-host with npx @qwixl/agent-backend.",
    );
  }

  async suspend(): Promise<void> {
    throw new Error("Fleet not configured");
  }

  async resume(): Promise<void> {
    throw new Error("Fleet not configured");
  }

  async destroy(): Promise<void> {
    throw new Error("Fleet not configured");
  }

  async updateLlmApiKey(): Promise<void> {
    throw new Error("Fleet not configured");
  }
}

export async function createFleetProvisioner(
  agents: Map<string, HostedAgentRecord>,
): Promise<FleetProvisioner> {
  const mode = process.env.ATOM_FLEET_MODE?.trim().toLowerCase();
  if (mode === "docker") {
    if (!(await isDockerAvailable())) {
      throw new Error("ATOM_FLEET_MODE=docker but Docker is not available on this host");
    }
    return new DockerFleetProvisioner(agents);
  }
  if (devStubCredentials()) {
    return new DevStubProvisioner();
  }
  return new UnconfiguredProvisioner();
}

export { ensureCommunityHost, resolveCommunityHostPublicUrl };

export function newAgentId(): string {
  return randomBytes(8).toString("hex");
}

export function handleFromEmail(email: string): string {
  return email.split("@")[0]!.replace(/[^a-z0-9-]/gi, "-").slice(0, 24).toLowerCase();
}

export { devStubCredentials };
