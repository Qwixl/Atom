import type { SecretRef, SecretStore } from "./types.js";
import {
  DEFAULT_LLM_SECRET_REF,
  LLM_CONNECTION_STORAGE_KEY,
  type LlmConnectionConfig,
} from "./llmConnection.js";

const SESSION_CONNECTION_KEY = "atom-llm-config-session";

/** Session-scoped LLM connection metadata (production). Keys remain in SecretStore memory. */
export function loadLlmConnectionFromSession(
  secretStore: SecretStore,
  options?: { defaultRef?: SecretRef },
): LlmConnectionConfig | null {
  const defaultRef = options?.defaultRef ?? DEFAULT_LLM_SECRET_REF;
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(SESSION_CONNECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LlmConnectionConfig & { apiKey?: string }>;
    if (
      typeof parsed.apiKey === "string" &&
      parsed.apiKey.trim() &&
      parsed.baseUrl?.trim() &&
      parsed.model?.trim()
    ) {
      const connection: LlmConnectionConfig = {
        baseUrl: parsed.baseUrl.trim(),
        model: parsed.model.trim(),
        secretRef: defaultRef,
      };
      secretStore.set(defaultRef, parsed.apiKey.trim());
      sessionStorage.setItem(SESSION_CONNECTION_KEY, JSON.stringify(connection));
      return connection;
    }
    if (parsed.baseUrl?.trim() && parsed.model?.trim() && parsed.secretRef?.trim()) {
      return {
        baseUrl: parsed.baseUrl.trim(),
        model: parsed.model.trim(),
        secretRef: parsed.secretRef.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function persistLlmConnectionToSession(connection: LlmConnectionConfig): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_CONNECTION_KEY, JSON.stringify(connection));
  } catch {
    // Best-effort persistence.
  }
}

export function clearSessionLlmConnection(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_CONNECTION_KEY);
  } catch {
    // Best-effort.
  }
}

export { LLM_CONNECTION_STORAGE_KEY, SESSION_CONNECTION_KEY };
