/**
 * Thin agent → Atom-MC Atom Credits usage reporter (D104 / D107).
 * Reports usage facts only; GBP pricing stays on Mission Control.
 */

function controlPlaneBase(): string | null {
  const base = process.env.ATOM_CONTROL_PLANE_URL?.trim()?.replace(/\/$/, "");
  return base || null;
}

function adminToken(): string | null {
  return process.env.ATOM_ADMIN_TOKEN?.trim() || null;
}

function billingLane(): string {
  return process.env.ATOM_BILLING_LANE?.trim().toLowerCase() || "";
}

function postUsage(body: Record<string, unknown>): void {
  const base = controlPlaneBase();
  const token = adminToken();
  if (!base || !token) return;
  void fetch(`${base}/billing/credits/usage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => {
    /* never throw into voice/chat/commerce path */
  });
}

/** Standard-only inference (tokens). */
export function reportInferenceUsageToControlPlane(input: {
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  idempotencyKey?: string;
}): void {
  if (billingLane() !== "standard") return;
  const promptTokens = Math.max(0, Math.floor(input.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.floor(input.completionTokens ?? 0));
  if (promptTokens === 0 && completionTokens === 0) return;
  postUsage({
    meter: "inference",
    promptTokens,
    completionTokens,
    model: input.model,
    idempotencyKey: input.idempotencyKey,
  });
}

/** Standard + BYOK speech (char count and/or ConvAI duration; MC prices). */
export function reportSpeechUsageToControlPlane(input: {
  charCount?: number;
  /** ElevenLabs ConvAI session length — MC prices per minute. */
  durationSeconds?: number;
  idempotencyKey?: string;
}): void {
  const lane = billingLane();
  if (lane !== "standard" && lane !== "byok") return;
  const charCount = Math.max(0, Math.floor(input.charCount ?? 0));
  const durationSeconds = Math.max(0, Math.floor(input.durationSeconds ?? 0));
  if (charCount <= 0 && durationSeconds <= 0) return;
  postUsage({
    meter: "speech",
    ...(charCount > 0 ? { charCount } : {}),
    ...(durationSeconds > 0 ? { durationSeconds } : {}),
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * Agent Spend purse — all three lanes when CP is configured.
 * amountPence is the GBP pence already decided by the commerce rail.
 */
export function reportAgentSpendToControlPlane(input: {
  amountPence: number;
  description?: string;
  idempotencyKey?: string;
}): void {
  const amountPence = Math.floor(Number(input.amountPence));
  if (!Number.isFinite(amountPence) || amountPence <= 0) return;
  // Self-hosted may omit ATOM_BILLING_LANE; still report when CP URL is set.
  if (!controlPlaneBase()) return;
  postUsage({
    meter: "agent_spend",
    amountPence,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
  });
}
