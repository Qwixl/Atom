import {
  hashEmbedText,
  hybridRetrievalScore,
  scoreTokenOverlap,
  type TextEmbedder,
} from "@qwixl/owner-store";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const KNOWLEDGE_FILE = "business-knowledge.json";
const SCHEMA_VERSION = 1;
const MIN_RETRIEVAL_SCORE = 0.08;
const DEFAULT_CHUNK_CHARS = 900;

export type BusinessKnowledgeCategory = "policy" | "terms" | "faq" | "product" | "general";

export interface BusinessKnowledgeDocument {
  id: string;
  title: string;
  category: BusinessKnowledgeCategory;
  body: string;
  updatedAt: string;
}

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

export class BusinessKnowledgeStore {
  private readonly documents = new Map<string, BusinessKnowledgeDocument>();
  private chunks: KnowledgeChunk[] = [];
  private readonly filePath: string;
  private readonly embedder: TextEmbedder;

  constructor(
    filePath = resolveDataPath(KNOWLEDGE_FILE),
    embedder: TextEmbedder = hashEmbedText,
  ) {
    this.filePath = filePath;
    this.embedder = embedder;
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
    }
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
    void this.persist();
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
    void this.persist();
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
    void this.persist();
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

  private reindex(): void {
    this.chunks = [...this.documents.values()].flatMap((doc) => indexDocument(doc, this.embedder));
  }

  private async persist(): Promise<void> {
    const payload: KnowledgeFile = {
      schemaVersion: SCHEMA_VERSION,
      documents: this.list(),
      chunks: this.chunks,
    };
    await atomicWriteJson(this.filePath, payload);
  }
}
