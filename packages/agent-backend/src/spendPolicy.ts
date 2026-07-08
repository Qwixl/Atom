export type SpendCategory = "commerce" | "llm_inference" | "embedding" | "module_store";

export interface SpendPolicy {
  workspaceId: string;
  currency: string;
  /** Monthly budget in minor units (e.g. cents). 0 = unlimited. */
  monthlyBudgetMinor: number;
  /** Per-transaction ceiling in minor units. 0 = unlimited. */
  perTransactionCeilingMinor: number;
  /** Categories allowed without extra chrome when within budget. */
  allowedCategories: SpendCategory[];
  /** Amount above which consequential chrome is required (minor units). */
  chromeApprovalThresholdMinor: number;
  updatedAt: string;
}

export const DEFAULT_SPEND_POLICY: Omit<SpendPolicy, "workspaceId" | "updatedAt"> = {
  currency: "EUR",
  monthlyBudgetMinor: 0,
  perTransactionCeilingMinor: 0,
  allowedCategories: ["commerce", "llm_inference", "embedding"],
  chromeApprovalThresholdMinor: 5000,
};

export function defaultSpendPolicy(workspaceId: string): SpendPolicy {
  return {
    workspaceId,
    ...DEFAULT_SPEND_POLICY,
    updatedAt: new Date().toISOString(),
  };
}

export function spendPolicyAllows(
  policy: SpendPolicy,
  category: SpendCategory,
  amountMinor: number,
  monthSpentMinor: number,
): { allowed: boolean; reason?: string; requiresChrome: boolean } {
  if (!policy.allowedCategories.includes(category)) {
    return { allowed: false, reason: `Category ${category} not allowed`, requiresChrome: true };
  }
  if (policy.perTransactionCeilingMinor > 0 && amountMinor > policy.perTransactionCeilingMinor) {
    return { allowed: false, reason: "Exceeds per-transaction ceiling", requiresChrome: true };
  }
  if (policy.monthlyBudgetMinor > 0 && monthSpentMinor + amountMinor > policy.monthlyBudgetMinor) {
    return { allowed: false, reason: "Exceeds monthly budget", requiresChrome: true };
  }
  const requiresChrome =
    policy.chromeApprovalThresholdMinor > 0 && amountMinor >= policy.chromeApprovalThresholdMinor;
  return { allowed: true, requiresChrome };
}
