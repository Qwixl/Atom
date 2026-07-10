import { loadPendingHostedAuth } from "./pendingHostedAuth.js";

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
};

/** Merge React state with persisted signup draft (state updates may lag behind resume). */
export function resolveHostedSignupFields(state: {
  email: string;
  handle: string;
  llmApiKey: string;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}): ResolvedHostedSignup | null {
  const pending = loadPendingHostedAuth();
  const email = state.email.trim() || pending?.email?.trim() || "";
  const handle = state.handle.trim() || pending?.handle?.trim() || "";
  const llmApiKey = state.llmApiKey.trim() || pending?.llmApiKey?.trim() || "";
  const llmProvider =
    state.llmProvider?.trim() || pending?.llmProvider?.trim() || "openai";
  const llmBaseUrl =
    state.llmBaseUrl?.trim() ||
    pending?.llmBaseUrl?.trim() ||
    (llmProvider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : llmProvider === "custom"
        ? ""
        : "https://api.openai.com/v1");
  const llmModel =
    state.llmModel?.trim() ||
    pending?.llmModel?.trim() ||
    (llmProvider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini");
  if (!handle || !llmApiKey) return null;
  if (llmProvider === "custom" && !llmBaseUrl) return null;
  return { email, handle, llmApiKey, llmProvider, llmBaseUrl, llmModel };
}
