import { tokenize } from "./conversationMemory.js";

/** Maps text to a unit vector. Default implementation is on-device (no API). */
export type TextEmbedder = (text: string) => number[];

const DEFAULT_DIMS = 256;

/** FNV-1a 32-bit — deterministic feature hash for local embeddings. */
function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(vec: Float32Array): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    const value = vec[i] ?? 0;
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;
  const out: number[] = [];
  for (let i = 0; i < vec.length; i++) {
    out.push((vec[i] ?? 0) / norm);
  }
  return out;
}

/**
 * Feature-hashing embedder — offline fallback when no embedding API is configured.
 * Precedent: HashingVectorizer / random projection for on-device RAG.
 */
export function hashEmbedText(text: string, dims = DEFAULT_DIMS): number[] {
  const vec = new Float32Array(dims);
  const tokens = tokenize(text);
  const features: string[] = [];
  for (const token of tokens) {
    features.push(token, `#${token}`);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    features.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  if (features.length === 0) {
    const fallback = text.trim().toLowerCase();
    if (fallback) features.push(fallback);
  }
  for (const feature of features) {
    const hash = fnv1a(feature);
    const idx = hash % dims;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  return normalizeVector(vec);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** Blend lexical IR score with cosine similarity when embeddings are available. */
export function hybridRetrievalScore(
  lexicalScore: number,
  queryEmbedding: readonly number[] | undefined,
  documentEmbedding: readonly number[] | undefined,
  lexicalWeight = 0.4,
): number {
  if (!queryEmbedding || !documentEmbedding) return lexicalScore;
  const semantic = Math.max(0, cosineSimilarity(queryEmbedding, documentEmbedding));
  return lexicalWeight * lexicalScore + (1 - lexicalWeight) * semantic;
}

/** M10.8 — OpenAI-compatible embedding API (async; wire via ConversationMemoryOptions when configured). */
export interface ApiEmbedderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dims?: number;
}

export async function embedTextViaApi(text: string, config: ApiEmbedderConfig): Promise<number[]> {
  const dims = config.dims ?? DEFAULT_DIMS;
  try {
    const resp = await fetch(`${config.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, input: text }),
    });
    if (!resp.ok) return hashEmbedText(text, dims);
    const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = data.data?.[0]?.embedding;
    if (Array.isArray(vector) && vector.length > 0) return vector;
  } catch {
    // fall through
  }
  return hashEmbedText(text, dims);
}
