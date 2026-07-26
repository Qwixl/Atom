export interface HostedAgentRecord {
  id: string;
  handle: string;
  email: string;
  agentUrl: string;
  adminToken: string;
  status: "active" | "suspended";
  suspendReason?: string;
  createdAt: string;
  fleetMode: "dev-stub";
}

export interface ProvisionOutcome {
  agent: HostedAgentRecord;
  status: "provisioned" | "provisioned-dev";
  message?: string;
}

export type FleetLlmProvisionFields = {
  llmApiKey?: string;
  /** OpenAI-compatible base URL (e.g. OpenRouter). */
  llmBaseUrl?: string;
  llmModel?: string;
};

/** Local stub provisioner only — this package does not orchestrate remote fleets. */
export interface FleetProvisioner {
  readonly mode: "dev-stub" | "unconfigured";
  provision(input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
    llmBaseUrl?: string;
    llmModel?: string;
    workspaceKind?: "personal" | "business" | "developer";
    brainAlwaysOn?: boolean;
  }): Promise<ProvisionOutcome>;
  suspend(agent: HostedAgentRecord, reason: string): Promise<void>;
  resume(agent: HostedAgentRecord): Promise<void>;
  destroy(agent: HostedAgentRecord): Promise<void>;
  updateLlmConnection(
    agent: HostedAgentRecord,
    connection: { llmApiKey: string; llmBaseUrl?: string; llmModel?: string },
  ): Promise<void>;
}
