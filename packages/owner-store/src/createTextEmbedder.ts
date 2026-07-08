import { hashEmbedText, type AsyncTextEmbedder, type TextEmbedder } from "./textEmbedding.js";
import { parseEmbedderBackendKind } from "./v1Scope.js";
import { createApiTextEmbedder, createAsyncTextEmbedder } from "./apiTextEmbedding.js";

export interface CreateTextEmbedderOptions {
  kind?: import("./v1Scope.js").EmbedderBackendKind;
}

/**
 * Factory for text embedders used in RAG (personal memory, business knowledge).
 * v1 default: hash (on-device, no API). `api` reserved for production embedding services.
 */
export function createTextEmbedder(options: CreateTextEmbedderOptions = {}): TextEmbedder {
  const kind = options.kind ?? parseEmbedderBackendKind(process.env.ATOM_EMBEDDER);
  switch (kind) {
    case "hash":
      return hashEmbedText;
    case "api":
      return createApiTextEmbedder();
    default:
      return hashEmbedText;
  }
}

/**
 * Optional async embedder when `ATOM_EMBEDDER=api`. Returns null for hash (sync-only).
 * Business knowledge uses this for semantic reindex after upsert/load.
 */
export function createOptionalAsyncTextEmbedder(
  options: CreateTextEmbedderOptions = {},
): AsyncTextEmbedder | null {
  const kind = options.kind ?? parseEmbedderBackendKind(process.env.ATOM_EMBEDDER);
  if (kind !== "api") return null;
  return createAsyncTextEmbedder();
}
