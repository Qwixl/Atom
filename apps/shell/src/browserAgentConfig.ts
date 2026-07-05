import { ATOM_BROWSER_MODE, BROWSER_AGENT_API, browserAgentToken } from "./hostConfig.js";
import type { CommsAgentConfig } from "./comms/types.js";

/** Connection config for browser mode (proxied agent API, injected token). */
export function loadBrowserAgentConfig(): CommsAgentConfig | null {
  if (!ATOM_BROWSER_MODE) return null;
  const token = browserAgentToken();
  if (!token) return null;
  return {
    adminUrl: BROWSER_AGENT_API,
    adminToken: token,
  };
}
