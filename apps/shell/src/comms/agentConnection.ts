import { CommsAgentClient } from "./client.js";
import {
  clearCommsAdminToken,
  loadCommsAgentConfigSecure,
  refreshCommsConfigCache,
} from "./storage.js";
import { IS_PRODUCTION_HOST } from "../hostConfig.js";
import { isLocalHostUrl } from "../productionGuard.js";
import type { CommsAgentConfig } from "./types.js";

export type AgentConnectionStatus = "ok" | "missing-token" | "unauthorized" | "unreachable";

export async function probeAgentConnection(
  config?: CommsAgentConfig,
): Promise<AgentConnectionStatus> {
  const resolved = config ?? (await loadCommsAgentConfigSecure());
  if (IS_PRODUCTION_HOST && isLocalHostUrl(resolved.adminUrl)) return "missing-token";
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
  if (status === "ok") {
    await refreshCommsConfigCache();
  }
  return status;
}

export async function saveValidatedAgentConnection(config: CommsAgentConfig): Promise<void> {
  if (!config.adminUrl.trim()) {
    throw new Error("Admin URL is required.");
  }
  if (!config.adminToken?.trim()) {
    throw new Error("Connection token is required.");
  }
  const status = await probeAgentConnection(config);
  if (status === "unauthorized") {
    throw new Error("Connection token was rejected. Check the token and try again.");
  }
  if (status === "unreachable") {
    throw new Error("Could not reach your agent at that URL. Check that it is running and try again.");
  }
}
