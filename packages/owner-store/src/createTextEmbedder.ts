import { hashEmbedText, type TextEmbedder } from "./textEmbedding.js";
import { parseEmbedderBackendKind } from "./v1Scope.js";
import { createApiTextEmbedder } from "./apiTextEmbedding.js";

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
