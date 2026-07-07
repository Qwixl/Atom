/**
 * List model ids from an OpenAI-compatible GET /v1/models endpoint.
 * Supported by OpenAI, Ollama, Groq, Together, and many aggregators.
 */
export async function listOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const root = baseUrl.trim().replace(/\/+$/, "");
  if (!root || !apiKey.trim()) {
    throw new Error("Endpoint URL and API key are required to list models.");
  }
  const res = await fetch(`${root}/models`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!res.ok) {
    throw new Error(`Could not list models (${res.status}). You can still type a model name manually.`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) {
    throw new Error("The provider returned no models. Type a model name manually.");
  }
  return unique;
}
