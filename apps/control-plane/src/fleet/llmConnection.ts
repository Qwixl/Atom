/** LLM env vars passed into hosted agent containers. */

export type FleetLlmConnection = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

/** Docker `-e` pairs for LLM_API_KEY / LLM_BASE_URL / LLM_MODEL. */
export function llmConnectionEnvArgs(connection: FleetLlmConnection): string[] {
  const args: string[] = [];
  const apiKey = connection.apiKey?.trim();
  const baseUrl = connection.baseUrl?.trim().replace(/\/+$/, "");
  const model = connection.model?.trim();
  if (apiKey) {
    args.push("-e", `LLM_API_KEY=${apiKey}`);
  }
  if (baseUrl) {
    args.push("-e", `LLM_BASE_URL=${baseUrl}`);
  }
  if (model) {
    args.push("-e", `LLM_MODEL=${model}`);
  }
  return args;
}
