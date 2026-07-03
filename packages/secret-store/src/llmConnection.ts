import type { SecretRef, SecretStore } from "./types.js";

/** Persisted Live LLM connection metadata — no inline API key (D017). */
export interface LlmConnectionConfig {
  baseUrl: string;
  model: string;
  secretRef: SecretRef;
}

/** Runtime LLM config after resolving secretRef from a SecretStore. */
export interface ResolvedLlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_LLM_SECRET_REF = "atom.llm.primary";
export const LLM_CONNECTION_STORAGE_KEY = "atom-llm-config";

export function resolveLlmConfig(
  connection: LlmConnectionConfig,
  secretStore: SecretStore,
): ResolvedLlmConfig | null {
  const apiKey = secretStore.get(connection.secretRef);
  if (!apiKey?.trim() || !connection.baseUrl.trim() || !connection.model.trim()) {
    return null;
  }
  return {
    baseUrl: connection.baseUrl.trim(),
    model: connection.model.trim(),
    apiKey: apiKey.trim(),
  };
}

export function isLlmConnectionReady(
  connection: LlmConnectionConfig | null,
  secretStore: SecretStore,
): connection is LlmConnectionConfig {
  return connection !== null && resolveLlmConfig(connection, secretStore) !== null;
}

export function persistLlmConnection(connection: LlmConnectionConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LLM_CONNECTION_STORAGE_KEY, JSON.stringify(connection));
  } catch {
    // Best-effort persistence.
  }
}

/**
 * Load connection config from storage. Migrates legacy inline `apiKey` into
 * `SecretStore` and rewrites persisted JSON with `secretRef` only.
 */
export function loadAndMigrateLlmConnection(
  secretStore: SecretStore,
  options?: { configKey?: string; defaultRef?: SecretRef },
): LlmConnectionConfig | null {
  const configKey = options?.configKey ?? LLM_CONNECTION_STORAGE_KEY;
  const defaultRef = options?.defaultRef ?? DEFAULT_LLM_SECRET_REF;

  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(configKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<
      LlmConnectionConfig & { apiKey?: string }
    >;

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
      localStorage.setItem(configKey, JSON.stringify(connection));
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
