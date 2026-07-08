import { hashEmbedText, type AsyncTextEmbedder, type TextEmbedder } from "./textEmbedding.js";

export interface ApiTextEmbeddingOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function resolveApiConfig(options: ApiTextEmbeddingOptions = {}) {
  const baseUrl = (
    options.baseUrl ??
    process.env.ATOM_EMBEDDER_API_URL ??
    process.env.LLM_BASE_URL ??
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const apiKey = options.apiKey ?? process.env.ATOM_EMBEDDER_API_KEY ?? process.env.LLM_API_KEY ?? "";
  const model = options.model ?? process.env.ATOM_EMBEDDER_MODEL ?? "text-embedding-3-small";
  return { baseUrl, apiKey: apiKey.trim(), model, fetchImpl: options.fetchImpl ?? fetch };
}

export async function embedTextAsync(text: string, options: ApiTextEmbeddingOptions = {}): Promise<number[]> {
  const { baseUrl, apiKey, model, fetchImpl } = resolveApiConfig(options);
  if (!apiKey) {
    throw new Error("ATOM_EMBEDDER=api requires ATOM_EMBEDDER_API_KEY or LLM_API_KEY");
  }
  const response = await fetchImpl(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Embedding API failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Embedding API returned no vector");
  return embedding;
}

/**
 * Sync TextEmbedder for ATOM_EMBEDDER=api — uses hash vectors until async reindex runs.
 * Semantic vectors: call {@link embedTextAsync} / {@link createAsyncTextEmbedder} during knowledge index rebuild.
 */
export function createApiTextEmbedder(options: ApiTextEmbeddingOptions = {}): TextEmbedder {
  const { apiKey } = resolveApiConfig(options);
  if (!apiKey) {
    throw new Error("ATOM_EMBEDDER=api requires ATOM_EMBEDDER_API_KEY or LLM_API_KEY");
  }
  let warned = false;
  return (text: string) => {
    if (!warned && typeof console !== "undefined") {
      console.warn(
        "[owner-store] ATOM_EMBEDDER=api: sync path uses hash fallback; run async reindex for semantic embeddings.",
      );
    }
    warned = true;
    return hashEmbedText(text);
  };
}

/** Async embedder that calls the configured OpenAI-compatible embeddings API. */
export function createAsyncTextEmbedder(options: ApiTextEmbeddingOptions = {}): AsyncTextEmbedder {
  const { apiKey } = resolveApiConfig(options);
  if (!apiKey) {
    throw new Error("ATOM_EMBEDDER=api requires ATOM_EMBEDDER_API_KEY or LLM_API_KEY");
  }
  return (text: string) => embedTextAsync(text, options);
}
