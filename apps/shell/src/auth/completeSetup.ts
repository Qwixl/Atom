import { saveValidatedAgentConnection } from "../comms/agentConnection.js";
import { saveCommsAgentConfigSecure, saveOwnerAgentKind, type OwnerAgentKind } from "../comms/storage.js";
import { markFirstRunDone } from "../firstRunStorage.js";
import { saveOwnerHandle } from "../ownerHandle.js";

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
