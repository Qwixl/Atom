import {
  createOptionalAsyncTextEmbedder,
  createTextEmbedder,
  hybridRetrievalScore,
  scoreTokenOverlap,
  type AsyncTextEmbedder,
  type TextEmbedder,
} from "@qwixl/owner-store";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import type {
  BusinessKnowledgeBackend,
  BusinessKnowledgeCategory,
  BusinessKnowledgeDocument,
} from "./businessKnowledgeBackend.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

const SCHEMA_VERSION = 1;
const MIN_RETRIEVAL_SCORE = 0.08;
const DEFAULT_CHUNK_CHARS = 900;

/** v1 JSON backend — suitable for small reference corpora only (see AGENT-BACKEND.md). */
export const JSON_KNOWLEDGE_SOFT_LIMIT_DOCS = 200;
export const JSON_KNOWLEDGE_SOFT_LIMIT_CHARS = 2_000_000;

interface KnowledgeChunk {
  id: string;
  documentId: string;
  title: string;
  category: BusinessKnowledgeCategory;
  text: string;
  embedding: number[];
}

interface KnowledgeFile {
  schemaVersion: number;
  documents: BusinessKnowledgeDocument[];
  chunks: KnowledgeChunk[];
}

function slugId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function chunkDocumentText(body: string, maxChars = DEFAULT_CHUNK_CHARS): string[] {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    if (`${current}\n\n${paragraph}`.length <= maxChars) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }
    chunks.push(current);
    current = paragraph.length <= maxChars ? paragraph : paragraph.slice(0, maxChars);
  }
  if (current) chunks.push(current);
  if (chunks.length === 0 && body.trim()) chunks.push(body.trim().slice(0, maxChars));
  return chunks;
}

function indexDocument(
  doc: BusinessKnowledgeDocument,
  embedder: TextEmbedder,
): KnowledgeChunk[] {
  return chunkDocumentText(doc.body).map((text, index) => ({
    id: `${doc.id}:${index}`,
    documentId: doc.id,
    title: doc.title,
    category: doc.category,
    text,
    embedding: embedder(text),
  }));
}

async function indexDocumentAsync(
  doc: BusinessKnowledgeDocument,
  asyncEmbedder: AsyncTextEmbedder,
): Promise<KnowledgeChunk[]> {
  const parts = chunkDocumentText(doc.body);
  const chunks: KnowledgeChunk[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const text = parts[index]!;
    chunks.push({
      id: `${doc.id}:${index}`,
      documentId: doc.id,
      title: doc.title,
      category: doc.category,
      text,
      embedding: await asyncEmbedder(text),
    });
  }
  return chunks;
}

function parseCategory(value: unknown): BusinessKnowledgeCategory {
  if (
    value === "policy" ||
    value === "terms" ||
    value === "faq" ||
    value === "product" ||
    value === "general"
  ) {
    return value;
  }
  return "general";
}

function warnIfCorpusLarge(documents: Iterable<BusinessKnowledgeDocument>): void {
  let count = 0;
  let chars = 0;
  for (const doc of documents) {
    count += 1;
    chars += doc.body.length;
  }
  if (count > JSON_KNOWLEDGE_SOFT_LIMIT_DOCS || chars > JSON_KNOWLEDGE_SOFT_LIMIT_CHARS) {
    console.warn(
      `[business-knowledge] JSON backend corpus is large (${count} docs, ~${Math.round(chars / 1000)}k chars). ` +
        "This v1 store is for short reference material only. " +
        "Plan migration to ATOM_BUSINESS_KNOWLEDGE_BACKEND=sqlite or remote when available.",
    );
  }
}

/**
 * v1 on-disk JSON implementation of {@link BusinessKnowledgeBackend}.
 * Not intended for enterprise policy libraries — see AGENT-BACKEND.md § Business knowledge.
 */
export class BusinessKnowledgeStore implements BusinessKnowledgeBackend {
  static readonly storeMeta = AGENT_STORE_REGISTRY.businessKnowledge;
  private readonly documents = new Map<string, BusinessKnowledgeDocument>();
  private chunks: KnowledgeChunk[] = [];
  private readonly filePath: string;
  private readonly embedder: TextEmbedder;
  private readonly asyncEmbedder: AsyncTextEmbedder | null;
  private persistQueue: Promise<void> = Promise.resolve();
  private reindexQueue: Promise<void> = Promise.resolve();

  constructor(
    filePath: string,
    embedder: TextEmbedder = createTextEmbedder(),
    asyncEmbedder: AsyncTextEmbedder | null = createOptionalAsyncTextEmbedder(),
  ) {
    this.filePath = filePath;
    this.embedder = embedder;
    this.asyncEmbedder = asyncEmbedder;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<KnowledgeFile>(this.filePath);
    if (!file?.documents?.length) return;
    this.documents.clear();
    for (const doc of file.documents) {
      if (!doc.id?.trim() || !doc.title?.trim() || !doc.body?.trim()) continue;
      this.documents.set(doc.id, {
        id: doc.id,
        title: doc.title.trim(),
        category: parseCategory(doc.category),
        body: doc.body,
        updatedAt: doc.updatedAt ?? new Date().toISOString(),
      });
    }
    this.chunks = Array.isArray(file.chunks) ? file.chunks : [];
    if (this.chunks.length === 0 && this.documents.size > 0) {
      this.reindex();
      this.scheduleAsyncReindex();
    }
    warnIfCorpusLarge(this.documents.values());
  }

  list(): BusinessKnowledgeDocument[] {
    return [...this.documents.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  get(documentId: string): BusinessKnowledgeDocument | undefined {
    return this.documents.get(documentId);
  }

  upsert(input: {
    id?: string;
    title: string;
    category?: BusinessKnowledgeCategory;
    body: string;
  }): BusinessKnowledgeDocument {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error("title and body required");
    const id = input.id?.trim() || slugId(title) || `doc-${Date.now()}`;
    const doc: BusinessKnowledgeDocument = {
      id,
      title,
      category: input.category ?? "general",
      body,
      updatedAt: new Date().toISOString(),
    };
    this.documents.set(id, doc);
    this.chunks = this.chunks.filter((chunk) => chunk.documentId !== id);
    this.chunks.push(...indexDocument(doc, this.embedder));
    warnIfCorpusLarge(this.documents.values());
    this.persist();
    this.scheduleAsyncReindex();
    return doc;
  }

  upsertPolicyReference(label: string, value: string): BusinessKnowledgeDocument {
    return this.upsert({
      id: `policy-${slugId(label)}`,
      title: label,
      category: "policy",
      body: value,
    });
  }

  remove(documentId: string): boolean {
    const removed = this.documents.delete(documentId);
    if (!removed) return false;
    this.chunks = this.chunks.filter((chunk) => chunk.documentId !== documentId);
    this.persist();
    return true;
  }

  replaceAll(documents: BusinessKnowledgeDocument[]): void {
    this.documents.clear();
    this.chunks = [];
    for (const doc of documents) {
      if (!doc.id?.trim() || !doc.title?.trim() || !doc.body?.trim()) continue;
      this.documents.set(doc.id, {
        id: doc.id.trim(),
        title: doc.title.trim(),
        category: parseCategory(doc.category),
        body: doc.body,
        updatedAt: doc.updatedAt ?? new Date().toISOString(),
      });
    }
    this.reindex();
    warnIfCorpusLarge(this.documents.values());
    this.persist();
    this.scheduleAsyncReindex();
  }

  retrieve(query: string, limit = 6): string[] {
    const trimmed = query.trim();
    if (!trimmed || this.chunks.length === 0) return [];
    return this.chunks
      .map((chunk) => {
        const lexical = scoreTokenOverlap(trimmed, chunk.text);
        const score = hybridRetrievalScore(lexical, this.embedder(trimmed), chunk.embedding);
        return { chunk, score };
      })
      .filter((entry) => entry.score >= MIN_RETRIEVAL_SCORE)
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, limit)
      .map((entry) => `[${entry.chunk.category}] ${entry.chunk.title}: ${entry.chunk.text}`);
  }

  async retrieveAsync(query: string, limit = 6): Promise<string[]> {
    const trimmed = query.trim();
    if (!trimmed || this.chunks.length === 0) return [];
    await this.reindexQueue;
    const queryEmbedding = this.asyncEmbedder
      ? await this.asyncEmbedder(trimmed)
      : this.embedder(trimmed);
    return this.chunks
      .map((chunk) => {
        const lexical = scoreTokenOverlap(trimmed, chunk.text);
        const score = hybridRetrievalScore(lexical, queryEmbedding, chunk.embedding);
        return { chunk, score };
      })
      .filter((entry) => entry.score >= MIN_RETRIEVAL_SCORE)
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, limit)
      .map((entry) => `[${entry.chunk.category}] ${entry.chunk.title}: ${entry.chunk.text}`);
  }

  async reindexAsync(): Promise<void> {
    if (!this.asyncEmbedder) return;
    const docs = [...this.documents.values()];
    const next: KnowledgeChunk[] = [];
    for (const doc of docs) {
      next.push(...(await indexDocumentAsync(doc, this.asyncEmbedder)));
    }
    this.chunks = next;
    this.persist();
    await this.flush();
  }

  private scheduleAsyncReindex(): void {
    if (!this.asyncEmbedder) return;
    this.reindexQueue = this.reindexQueue
      .then(() => this.reindexAsync())
      .catch((error) => {
        console.warn(
          `[business-knowledge] async reindex failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private reindex(): void {
    this.chunks = [...this.documents.values()].flatMap((doc) => indexDocument(doc, this.embedder));
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const payload: KnowledgeFile = {
          schemaVersion: SCHEMA_VERSION,
          documents: this.list(),
          chunks: this.chunks,
        };
        await atomicWriteJson(this.filePath, payload);
      })
      .catch((error) => {
        console.warn(
          `[business-knowledge] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  async flush(): Promise<void> {
    await this.persistQueue;
  }
}
