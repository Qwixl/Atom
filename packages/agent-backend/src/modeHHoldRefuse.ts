/**
 * Shared Mode H hold refusal (BUS-01-HOLD-GATE / HOLD-EVICT).
 * Keep transactionAdmin and paymentAdmin in lockstep.
 */
export const MODE_H_HOLD_REFUSED =
  "Mode H commerce offers must use merchant Checkout (commerce:offer settlementMode=merchant-checkout). Authorization hold is not allowed.";

export function shouldRefuseModeHHold(input: {
  settlementMode?: string;
  subjectId?: string;
  isModeHHoldSubject?: (subjectId: string) => boolean;
}): boolean {
  const subjectId = input.subjectId?.trim() ?? "";
  const settlementMode = input.settlementMode?.trim();
  const knownModeH =
    Boolean(subjectId) &&
    typeof input.isModeHHoldSubject === "function" &&
    input.isModeHHoldSubject(subjectId);
  return (
    settlementMode === "merchant-checkout" ||
    /^offer[-_]/i.test(subjectId) ||
    subjectId.startsWith("offer") ||
    knownModeH
  );
}
