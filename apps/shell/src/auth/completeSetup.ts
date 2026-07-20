import { saveAgUiConfigForAgent } from "../agUiConfig.js";
import { saveValidatedAgentConnection } from "../comms/agentConnection.js";
import { saveCommsAgentConfigSecure, saveOwnerAgentKind, type OwnerAgentKind } from "../comms/storage.js";
import { setChatSessionToken } from "../comms/chatSessionToken.js";
import { markFirstRunDone } from "../firstRunStorage.js";
import { saveOwnerHandle } from "../ownerHandle.js";
import { isSupabaseConfigured, MANAGED_HOSTING } from "../hostConfig.js";
import { fetchHostedAgentConnection, supabaseAccessToken } from "./hostedAccount.js";

export async function completeAgentSetup(input: {
  adminUrl: string;
  adminToken?: string;
  sessionToken?: string;
  handle?: string;
  kind: OwnerAgentKind;
  /** Hosted signup: control plane already validated the agent; skip browser health probe. */
  skipConnectionProbe?: boolean;
}): Promise<void> {
  if (input.sessionToken?.trim()) {
    setChatSessionToken(input.sessionToken.trim());
  }
  // Hosted PR2: persist root admin only when the control plane still returns it (legacy).
  const persistToken = input.adminToken?.trim() || undefined;
  if (!input.skipConnectionProbe && persistToken) {
    await saveValidatedAgentConnection({
      adminUrl: input.adminUrl,
      adminToken: persistToken,
    });
  }
  await saveCommsAgentConfigSecure({
    adminUrl: input.adminUrl,
    adminToken: persistToken,
  });
  saveOwnerAgentKind(input.kind);
  if (input.handle) saveOwnerHandle(input.handle);
  saveAgUiConfigForAgent(input.adminUrl);
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
      sessionToken: connection.sessionToken,
      handle: connection.handle,
      kind: "hosted",
      skipConnectionProbe: true,
    });
    return true;
  } catch {
    return false;
  }
}
