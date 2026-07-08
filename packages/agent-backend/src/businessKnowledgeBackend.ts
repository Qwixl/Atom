import { resolveDataPath } from "./dataDir.js";
import { BusinessKnowledgeStore } from "./businessKnowledgeStore.js";
import { SqliteBusinessKnowledgeStore } from "./sqliteBusinessKnowledgeStore.js";

/** Reference document category for retrieval and admin sync. */
export type BusinessKnowledgeCategory = "policy" | "terms" | "faq" | "product" | "general";

export interface BusinessKnowledgeDocument {
  id: string;
  title: string;
  category: BusinessKnowledgeCategory;
  body: string;
  updatedAt: string;
}

/**
 * Pluggable business reference store (M12.8).
 *
 * v1: `json` — single-file index on the agent data volume (small corpora only).
 * `sqlite` — Node `node:sqlite` chunked index + hybrid retrieval (BK-D1 / M12.9).
 * Planned: `remote` (Qwixl-operated or customer-operated knowledge service; same admin/sync API).
 *
 * Admin routes, shell sync, and `/agent` retrieval depend on this interface only.
 */
export interface BusinessKnowledgeBackend {
  load(): Promise<void>;
  list(): BusinessKnowledgeDocument[];
  get(documentId: string): BusinessKnowledgeDocument | undefined;
  upsert(input: {
    id?: string;
    title: string;
    category?: BusinessKnowledgeCategory;
    body: string;
  }): BusinessKnowledgeDocument;
  upsertPolicyReference(label: string, value: string): BusinessKnowledgeDocument;
  remove(documentId: string): boolean;
  replaceAll(documents: BusinessKnowledgeDocument[]): void;
  retrieve(query: string, limit?: number): string[];
}

/** Supported values for `ATOM_BUSINESS_KNOWLEDGE_BACKEND`. */
export type BusinessKnowledgeBackendKind = "json" | "sqlite" | "remote";

const BACKEND_KINDS: BusinessKnowledgeBackendKind[] = ["json", "sqlite", "remote"];

function parseBackendKind(raw: string | undefined): BusinessKnowledgeBackendKind {
  const value = raw?.trim().toLowerCase();
  if (value && BACKEND_KINDS.includes(value as BusinessKnowledgeBackendKind)) {
    return value as BusinessKnowledgeBackendKind;
  }
  return "json";
}

export interface CreateBusinessKnowledgeBackendOptions {
  kind?: BusinessKnowledgeBackendKind;
  dataPath?: string;
  remoteUrl?: string | null;
}

/**
 * Factory for the business knowledge backend. Defaults to on-disk JSON (v1).
 * Throws for unimplemented backends so misconfiguration fails at startup, not mid-chat.
 */
export function createBusinessKnowledgeBackend(
  options: CreateBusinessKnowledgeBackendOptions = {},
): BusinessKnowledgeBackend {
  const kind = options.kind ?? parseBackendKind(process.env.ATOM_BUSINESS_KNOWLEDGE_BACKEND);
  switch (kind) {
    case "json":
      return new BusinessKnowledgeStore(
        options.dataPath ?? resolveDataPath("business-knowledge.json"),
      );
    case "sqlite":
      return new SqliteBusinessKnowledgeStore(
        options.dataPath ?? resolveDataPath("business-knowledge.sqlite"),
      );
    case "remote":
      if (!options.remoteUrl?.trim() && !process.env.ATOM_BUSINESS_KNOWLEDGE_REMOTE_URL?.trim()) {
        throw new Error(
          "ATOM_BUSINESS_KNOWLEDGE_REMOTE_URL is required when ATOM_BUSINESS_KNOWLEDGE_BACKEND=remote. " +
            "Remote backend is reserved for a future hosted or customer-operated knowledge service.",
        );
      }
      throw new Error(
        "ATOM_BUSINESS_KNOWLEDGE_BACKEND=remote is not implemented yet. " +
          "Planned: HTTP adapter to a knowledge service; admin/sync routes unchanged. Use json (default).",
      );
    default:
      throw new Error(`Unknown ATOM_BUSINESS_KNOWLEDGE_BACKEND: ${String(kind)}`);
  }
}
