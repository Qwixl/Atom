export interface HostedAgentRecord {
  id: string;
  handle: string;
  email: string;
  agentUrl: string;
  adminToken: string;
  status: "active" | "suspended";
  suspendReason?: string;
  createdAt: string;
  fleetMode: "docker" | "dev-stub";
  containerId?: string;
  containerName?: string;
  hostPort?: number;
}

export interface ProvisionOutcome {
  agent: HostedAgentRecord;
  status: "provisioned" | "provisioned-dev";
  message?: string;
}

export interface FleetProvisioner {
  readonly mode: "docker" | "dev-stub" | "unconfigured";
  provision(input: {
    id: string;
    handle: string;
    email: string;
    llmApiKey?: string;
    /** personal | business | developer — sets ATOM_WORKSPACE_KIND / business mode on container. */
    workspaceKind?: "personal" | "business" | "developer";
  }): Promise<ProvisionOutcome>;
  suspend(agent: HostedAgentRecord, reason: string): Promise<void>;
  resume(agent: HostedAgentRecord): Promise<void>;
  destroy(agent: HostedAgentRecord): Promise<void>;
  /** Recreate the agent container with a new LLM_API_KEY (preserves port, token, data). */
  updateLlmApiKey(agent: HostedAgentRecord, llmApiKey: string): Promise<void>;
}
