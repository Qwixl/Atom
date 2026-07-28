import { loadPendingHostedAuth } from "./pendingHostedAuth.js";
import {
  isHostedLlmProviderId,
  resolveHostedLlmConnection,
  type HostedLlmProviderId,
} from "../settings/llmProviderPresets.js";

const LOCK_KEY = "atom:hosted-provisioning";
const LOCK_TTL_MS = 3 * 60 * 1000;

export function tryAcquireProvisioningLock(): boolean {
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (raw) {
      const started = Number(raw);
      if (Number.isFinite(started) && Date.now() - started < LOCK_TTL_MS) {
        return false;
      }
    }
    sessionStorage.setItem(LOCK_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

export function releaseProvisioningLock(): void {
  try {
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

export type ResolvedHostedSignup = {
  email: string;
  handle: string;
  llmApiKey: string;
  llmProvider: string;
  llmBaseUrl: string;
  llmModel: string;
  /** standard = platform LLM (no owner key); byok = owner key required */
  billingLane?: "standard" | "byok";
};

/** Merge React state with persisted signup draft (state updates may lag behind resume). */
export function resolveHostedSignupFields(state: {
  email: string;
  handle: string;
  llmApiKey: string;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  billingLane?: "standard" | "byok";
}): ResolvedHostedSignup | null {
  const pending = loadPendingHostedAuth();
  const email = state.email.trim() || pending?.email?.trim() || "";
  const handle = state.handle.trim() || pending?.handle?.trim() || "";
  const billingLane = state.billingLane ?? "byok";
  const llmApiKey = state.llmApiKey.trim() || pending?.llmApiKey?.trim() || "";
  const rawProvider =
    state.llmProvider?.trim() || pending?.llmProvider?.trim() || "openai";
  const llmProvider: HostedLlmProviderId = isHostedLlmProviderId(rawProvider)
    ? rawProvider
    : "openai";
  const resolved = resolveHostedLlmConnection({
    providerId: llmProvider,
    baseUrl: state.llmBaseUrl?.trim() || pending?.llmBaseUrl?.trim() || undefined,
    model: state.llmModel?.trim() || pending?.llmModel?.trim() || undefined,
  });
  const llmBaseUrl = resolved.baseUrl;
  const llmModel = resolved.model;
  if (!handle) return null;
  if (billingLane === "standard") {
    return {
      email,
      handle,
      llmApiKey: "",
      llmProvider: "openrouter",
      llmBaseUrl: "https://openrouter.ai/api/v1",
      llmModel: "",
      billingLane: "standard",
    };
  }
  if (!llmApiKey) return null;
  if (llmProvider === "custom" && !llmBaseUrl) return null;
  return { email, handle, llmApiKey, llmProvider, llmBaseUrl, llmModel, billingLane: "byok" };
}
