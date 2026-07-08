import type { ConsequentialAction } from "@qwixl/shell-core";
import { requireCustodyApproval } from "../custody/approvalGate.js";
import type { CommsAgentConfig } from "../comms/types.js";

/** Passkey approval ref for connector vault writes (feeds, bookmarks). */
export async function approvalRefForConnectorWrite(
  title: string,
  terms: Record<string, string>,
  config?: CommsAgentConfig,
): Promise<string> {
  const action: ConsequentialAction = {
    id: crypto.randomUUID(),
    kind: "permission",
    title,
    terms,
    confirmLabel: "Approve",
    declineLabel: "Cancel",
  };
  const { approvalRef } = await requireCustodyApproval(action, config);
  return approvalRef;
}
