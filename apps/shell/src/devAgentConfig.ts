import { SHOW_DEV_WORKFLOWS } from "./hostConfig.js";
import type { CommsAgentConfig } from "./comms/types.js";

/** Dev-only: optional auto-connect without GUI wizard (set in apps/shell/.env.local). */
export function loadDevAgentDefaults(): Partial<CommsAgentConfig> {
  if (!SHOW_DEV_WORKFLOWS) return {};
  const adminUrl = (import.meta.env.VITE_DEV_AGENT_URL as string | undefined)?.replace(/\/$/, "");
  const adminToken = (import.meta.env.VITE_DEV_AGENT_TOKEN as string | undefined)?.trim();
  return {
    ...(adminUrl ? { adminUrl } : {}),
    ...(adminToken ? { adminToken } : {}),
  };
}
