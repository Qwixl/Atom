import { loadJsonFromStorage, saveJsonToStorage } from "@qwixl/shell-core";
import type { AgUiAgentConfig } from "@qwixl/ag-ui-adapter";
import { IS_PRODUCTION_HOST } from "./hostConfig.js";
import { loadCommsAgentConfig } from "./comms/storage.js";

export const AGUI_CONFIG_KEY = "atom-agui-config";
export const DEFAULT_AGUI_URL = "http://localhost:5201/agent";

export function agUiUrlFromAgentAdminUrl(adminUrl: string): string {
  return `${adminUrl.trim().replace(/\/$/, "")}/agent`;
}

export function saveAgUiConfigForAgent(adminUrl: string): AgUiAgentConfig {
  const config = { url: agUiUrlFromAgentAdminUrl(adminUrl) };
  saveJsonToStorage(AGUI_CONFIG_KEY, config);
  return config;
}

export function loadAgUiConfig(): AgUiAgentConfig {
  const parsed = loadJsonFromStorage<{ url?: string }>(AGUI_CONFIG_KEY);
  if (parsed?.url?.trim()) return { url: parsed.url.trim() };
  const adminUrl = loadCommsAgentConfig().adminUrl?.trim();
  if (adminUrl) return { url: agUiUrlFromAgentAdminUrl(adminUrl) };
  if (IS_PRODUCTION_HOST) return { url: "" };
  return { url: DEFAULT_AGUI_URL };
}

/**
 * Bearer auth for POST /agent.
 * Prefer a short-lived `chat:agui` session token; fall back to admin only if mint failed (M21.4).
 */
export function agUiAuthHeaders(bearerToken?: string): Record<string, string> | undefined {
  const token = bearerToken?.trim();
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}
