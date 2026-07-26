/** LLM connection fields for hosted-agent env (operator-defined). */

export type FleetLlmConnection = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

/** Env map for LLM_API_KEY / LLM_BASE_URL / LLM_MODEL. */
export function llmConnectionEnv(connection: FleetLlmConnection): Record<string, string> {
  const out: Record<string, string> = {};
  const apiKey = connection.apiKey?.trim();
  const baseUrl = connection.baseUrl?.trim().replace(/\/+$/, "");
  const model = connection.model?.trim();
  if (apiKey) out.LLM_API_KEY = apiKey;
  if (baseUrl) out.LLM_BASE_URL = baseUrl;
  if (model) out.LLM_MODEL = model;
  return out;
}
