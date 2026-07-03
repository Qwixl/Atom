import type { ConsequentialAction } from "./types.js";
import type { DataRequest } from "./session.js";

/** Shell-owned chrome moment — consequential action or guarded data disclosure. */
export type PendingChrome = {
  surfaceId: string;
  action: ConsequentialAction;
  dataRequest?: DataRequest;
};

export function buildDataRequestChrome(
  request: DataRequest,
  recordCount: number,
): PendingChrome {
  return {
    surfaceId: "owner-store",
    dataRequest: request,
    action: {
      id: request.requestId,
      kind: "permission",
      title: "Share guarded data with your agent's model",
      terms: {
        categories: request.categories.join(", "),
        "agent's reason": request.reason,
        "records disclosed": String(recordCount),
        scope: "this conversation only",
      },
      confirmLabel: "Share",
      declineLabel: "Keep private",
    },
  };
}
