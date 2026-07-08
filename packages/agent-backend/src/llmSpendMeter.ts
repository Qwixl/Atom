import type { BudgetLedgerStore } from "./budgetLedger.js";
import { evaluateSpend } from "./billingAdmin.js";

/** Rough USD→minor estimate for LLM usage when provider does not return cost. */
export function estimateLlmCostMinor(input: {
  promptTokens?: number;
  completionTokens?: number;
  /** USD per 1M input tokens */
  inputUsdPerMillion?: number;
  /** USD per 1M output tokens */
  outputUsdPerMillion?: number;
}): number {
  const inTok = Math.max(0, input.promptTokens ?? 0);
  const outTok = Math.max(0, input.completionTokens ?? 0);
  const inRate = input.inputUsdPerMillion ?? 3;
  const outRate = input.outputUsdPerMillion ?? 15;
  const usd = (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  return Math.max(1, Math.round(usd * 100));
}

export function recordLlmInferenceSpend(
  budgetLedger: BudgetLedgerStore,
  input: {
    workspaceId?: string;
    promptTokens?: number;
    completionTokens?: number;
    model?: string;
  },
): { ok: boolean; reason?: string; amountMinor: number } {
  const workspaceId = input.workspaceId?.trim() || process.env.ATOM_WORKSPACE_ID?.trim() || "personal";
  const amountMinor = estimateLlmCostMinor({
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
  });
  const verdict = evaluateSpend(
    { budgetLedger },
    { workspaceId, category: "llm_inference", amountMinor, currency: "USD" },
  );
  if (!verdict.allowed) return { ok: false, reason: verdict.reason, amountMinor };
  budgetLedger.append({
    workspaceId,
    category: "llm_inference",
    amountMinor,
    currency: "USD",
    description: `llm ${input.model ?? "unknown"} in=${input.promptTokens ?? 0} out=${input.completionTokens ?? 0}`,
  });
  return { ok: true, amountMinor };
}
