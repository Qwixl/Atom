import { CommsAgentClient } from "./client.js";
import { clearCommsAdminToken, loadCommsAgentConfigSecure } from "./storage.js";
import type { CommsAgentConfig } from "./types.js";

export type AgentConnectionStatus = "ok" | "missing-token" | "unauthorized" | "unreachable";

export async function probeAgentConnection(
  config?: CommsAgentConfig,
): Promise<AgentConnectionStatus> {
  const resolved = config ?? (await loadCommsAgentConfigSecure());
  if (!resolved.adminToken?.trim()) return "missing-token";
  try {
    const client = new CommsAgentClient(resolved.adminUrl, resolved.adminToken);
    const health = await client.health();
    return health.ok ? "ok" : "unreachable";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unauthorized|401/i.test(message)) return "unauthorized";
    return "unreachable";
  }
}

/** Clear stale credentials after 401 and return updated status. */
export async function reconcileAgentConnection(
  config?: CommsAgentConfig,
): Promise<AgentConnectionStatus> {
  const resolved = config ?? (await loadCommsAgentConfigSecure());
  const status = await probeAgentConnection(resolved);
  if (status === "unauthorized") {
    clearCommsAdminToken();
    return "missing-token";
  }
  return status;
}

export async function saveValidatedAgentConnection(config: CommsAgentConfig): Promise<void> {
  if (!config.adminUrl.trim()) {
    throw new Error("Admin URL is required.");
  }
  if (!config.adminToken?.trim()) {
    throw new Error("Admin bearer token is required.");
  }
  const status = await probeAgentConnection(config);
  if (status === "unauthorized") {
    throw new Error(
      "Admin token rejected (401). Copy the bearer token from your agent startup log (~/.atom/agent-admin-token.txt).",
    );
  }
  if (status === "unreachable") {
    throw new Error("Could not reach the agent at that URL. Is pnpm dev:a2a running?");
  }
}
