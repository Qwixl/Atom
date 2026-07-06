import { saveValidatedAgentConnection } from "../comms/agentConnection.js";
import { saveCommsAgentConfigSecure, saveOwnerAgentKind, type OwnerAgentKind } from "../comms/storage.js";
import { markFirstRunDone } from "../firstRunStorage.js";
import { saveOwnerHandle } from "../ownerHandle.js";
import { isSupabaseConfigured, MANAGED_HOSTING } from "../hostConfig.js";
import { fetchHostedAgentConnection, supabaseAccessToken } from "./hostedAccount.js";

export async function completeAgentSetup(input: {
  adminUrl: string;
  adminToken?: string;
  handle?: string;
  kind: OwnerAgentKind;
  /** Hosted signup: control plane already validated the agent; skip browser health probe. */
  skipConnectionProbe?: boolean;
}): Promise<void> {
  if (!input.skipConnectionProbe) {
    await saveValidatedAgentConnection({
      adminUrl: input.adminUrl,
      adminToken: input.adminToken,
    });
  }
  await saveCommsAgentConfigSecure({
    adminUrl: input.adminUrl,
    adminToken: input.adminToken,
  });
  saveOwnerAgentKind(input.kind);
  if (input.handle) saveOwnerHandle(input.handle);
  markFirstRunDone();
}

/** Refresh shell credentials from the control plane (hosted signup reconnect). */
export async function tryReconnectHostedAgent(): Promise<boolean> {
  if (!MANAGED_HOSTING || !isSupabaseConfigured()) return false;
  const token = await supabaseAccessToken();
  if (!token) return false;
  try {
    const connection = await fetchHostedAgentConnection();
    await completeAgentSetup({
      adminUrl: connection.adminUrl,
      adminToken: connection.adminToken,
      handle: connection.handle,
      kind: "hosted",
      skipConnectionProbe: true,
    });
    return true;
  } catch {
    return false;
  }
}
