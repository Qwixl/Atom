/**
 * Public Atom control-plane stub (D097).
 * Production Docker fleet lives in private Qwixl/Atom-MC.
 * Local: HOSTED_STUB_AGENT_URL + HOSTED_STUB_AGENT_TOKEN via `pnpm dev:hosting`.
 */
import type { FleetProvisioner, HostedAgentRecord, ProvisionOutcome } from "./types.js";

export function handleFromEmail(email: string): string {
  const local = email.split("@")[0] || "agent";
  return local.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "agent";
}

export function newAgentId(): string {
  return `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function devStubCredentials(): { agentUrl: string; adminToken: string } | null {
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
    llmBaseUrl?: string;
    llmModel?: string;
    workspaceKind?: "personal" | "business" | "developer";
    brainAlwaysOn?: boolean;
  }): Promise<ProvisionOutcome> {
    void input.workspaceKind;
    void input.brainAlwaysOn;
    void input.llmBaseUrl;
    void input.llmModel;
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
        "Local stub: agent at HOSTED_STUB_AGENT_URL. Production fleet is Atom-MC (private), not this package.",
    };
  }

  async suspend(_agent: HostedAgentRecord, _reason: string): Promise<void> {}
  async resume(_agent: HostedAgentRecord): Promise<void> {}
  async destroy(_agent: HostedAgentRecord): Promise<void> {}
  async updateLlmConnection(
    _agent: HostedAgentRecord,
    _connection: { llmApiKey: string; llmBaseUrl?: string; llmModel?: string },
  ): Promise<void> {}
}

class UnconfiguredProvisioner implements FleetProvisioner {
  readonly mode = "unconfigured" as const;

  async provision(_input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
    llmBaseUrl?: string;
    llmModel?: string;
    workspaceKind?: "personal" | "business" | "developer";
    brainAlwaysOn?: boolean;
  }): Promise<ProvisionOutcome> {
    throw new Error(
      "Hosted signup stub only: set HOSTED_STUB_AGENT_URL + HOSTED_STUB_AGENT_TOKEN (pnpm dev:hosting), or use Qwixl Atom-MC for production fleet.",
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
  async updateLlmConnection(): Promise<void> {
    throw new Error("Fleet not configured");
  }
}

/** Stub never runs Docker — production provisioner is Atom-MC. */
export async function createFleetProvisioner(
  _agents: Map<string, HostedAgentRecord>,
): Promise<FleetProvisioner> {
  if (devStubCredentials()) return new DevStubProvisioner();
  return new UnconfiguredProvisioner();
}

export async function ensureCommunityHost(_dataDir: string): Promise<void> {
  /* production community host: Atom-MC */
}

export function resolveCommunityHostPublicUrl(): string | undefined {
  return process.env.ATOM_COMMUNITY_HOST_URL?.trim() || undefined;
}
