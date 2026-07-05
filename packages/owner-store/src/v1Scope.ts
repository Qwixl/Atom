/**
 * v1 scope markers for owner-store (D048). Personal memory and embeddings use
 * minimal on-device engines; production upgrades swap implementation, not API shape.
 */

/** Default cap on conversation memory chunks in browser storage (M10 v1). */
export const PERSONAL_MEMORY_V1_MAX_CHUNKS = 200;

/** Soft warning threshold before memory index compaction pressure. */
export const PERSONAL_MEMORY_V1_SOFT_CHAR_LIMIT = 1_500_000;

/** Supported values for ATOM_EMBEDDER (agent-backend / future shell config). */
export type EmbedderBackendKind = "hash" | "api";

export function parseEmbedderBackendKind(raw: string | undefined): EmbedderBackendKind {
  const value = raw?.trim().toLowerCase();
  if (value === "api") return "api";
  return "hash";
}
