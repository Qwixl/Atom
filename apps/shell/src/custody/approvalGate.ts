import type { ConsequentialAction } from "@qwixl/shell-core";
import { loadCommsAgentConfig } from "../comms/storage.js";
import { fetchCustodyStatus, verifyCustodyApproval } from "./client.js";

import { IS_DEMO_MODE } from "../demoPersonas.js";

const DEV_BYPASS =
  IS_DEMO_MODE || import.meta.env.VITE_CUSTODY_DEV_BYPASS === "1";

export async function requireCustodyApproval(
  action: ConsequentialAction,
): Promise<{ approvalRef: string }> {
  const config = loadCommsAgentConfig();
  if (!config.adminToken?.trim()) {
    throw new Error("Agent admin token required for custody approval");
  }

  if (DEV_BYPASS) {
    return { approvalRef: `dev-bypass:${action.id}` };
  }

  const status = await fetchCustodyStatus(config);
  if (!status.passkeyRegistered) {
    throw new Error("Register a passkey in Settings before approving consequential actions.");
  }
  return verifyCustodyApproval(config, action);
}
