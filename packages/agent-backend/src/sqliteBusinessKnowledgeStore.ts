import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createOptionalAsyncTextEmbedder,
  createTextEmbedder,
  hybridRetrievalScore,
  scoreTokenOverlap,
  type AsyncTextEmbedder,
  type TextEmbedder,
} from "@qwixl/owner-store";
import type {
  BusinessKnowledgeBackend,
  BusinessKnowledgeCategory,
  BusinessKnowledgeDocument,
} from "./businessKnowledgeBackend.js";
import { chunkDocumentText } from "./businessKnowledgeStore.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

const MIN_RETRIEVAL_SCORE = 0.08;

function slugId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

interface ChunkRow {
  id: string;
  document_id: string;
  title: string;
  category: string;
  text: string;
  embedding_json: string;
}

/**
 * M12.9 sqlite business-knowledge backend (BK-D1).
 * Uses Node's built-in `node:sqlite` (DatabaseSync) — no native addon dependency.
 */
export class SqliteBusinessKnowledgeStore implements BusinessKnowledgeBackend {
  static readonly storeMeta = AGENT_STORE_REGISTRY.businessKnowledge;
  private readonly filePath: string;
  private readonly embedder: TextEmbedder;
  private readonly asyncEmbedder: AsyncTextEmbedder | null;
  private db: DatabaseSync | null = null;
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
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
    `);
  }

  private requireDb(): DatabaseSync {
    if (!this.db) throw new Error("SqliteBusinessKnowledgeStore not loaded");
    return this.db;
  }

  list(): BusinessKnowledgeDocument[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT id, title, category, body, updated_at AS updatedAt FROM documents ORDER BY title COLLATE NOCASE`,
      )
      .all() as unknown as Array<{
      id: string;
      title: string;
      category: string;
      body: string;
      updatedAt: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: parseCategory(row.category),
      body: row.body,
      updatedAt: row.updatedAt,
    }));
  }

  get(documentId: string): BusinessKnowledgeDocument | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT id, title, category, body, updated_at AS updatedAt FROM documents WHERE id = ?`,
      )
      .get(documentId) as unknown as
      | { id: string; title: string; category: string; body: string; updatedAt: string }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      title: row.title,
      category: parseCategory(row.category),
      body: row.body,
      updatedAt: row.updatedAt,
    };
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
    const db = this.requireDb();
    db.prepare(
      `INSERT INTO documents (id, title, category, body, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         category = excluded.category,
         body = excluded.body,
         updated_at = excluded.updated_at`,
    ).run(doc.id, doc.title, doc.category, doc.body, doc.updatedAt);
    this.replaceChunksForDocument(doc);
    this.scheduleAsyncReindexForDocument(doc);
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
    const db = this.requireDb();
    db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
    const result = db.prepare(`DELETE FROM documents WHERE id = ?`).run(documentId);
    return Number(result.changes ?? 0) > 0;
  }

  replaceAll(documents: BusinessKnowledgeDocument[]): void {
    const db = this.requireDb();
    db.exec(`DELETE FROM chunks; DELETE FROM documents;`);
    for (const doc of documents) {
      if (!doc.id?.trim() || !doc.title?.trim() || !doc.body?.trim()) continue;
      this.upsert({
        id: doc.id.trim(),
        title: doc.title.trim(),
        category: parseCategory(doc.category),
        body: doc.body,
      });
    }
  }

  retrieve(query: string, limit = 6): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = this.requireDb()
      .prepare(
        `SELECT id, document_id, title, category, text, embedding_json FROM chunks`,
      )
      .all() as unknown as ChunkRow[];
    if (rows.length === 0) return [];
    const queryEmbedding = this.embedder(trimmed);
    return this.scoreRows(trimmed, queryEmbedding, rows, limit);
  }

  async retrieveAsync(query: string, limit = 6): Promise<string[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    await this.reindexQueue;
    const rows = this.requireDb()
      .prepare(
        `SELECT id, document_id, title, category, text, embedding_json FROM chunks`,
      )
      .all() as unknown as ChunkRow[];
    if (rows.length === 0) return [];
    const queryEmbedding = this.asyncEmbedder
      ? await this.asyncEmbedder(trimmed)
      : this.embedder(trimmed);
    return this.scoreRows(trimmed, queryEmbedding, rows, limit);
  }

  async reindexAsync(): Promise<void> {
    if (!this.asyncEmbedder) return;
    for (const doc of this.list()) {
      await this.replaceChunksForDocumentAsync(doc);
    }
  }

  private scoreRows(
    trimmed: string,
    queryEmbedding: number[],
    rows: ChunkRow[],
    limit: number,
  ): string[] {
    return rows
      .map((row) => {
        let embedding: number[] = [];
        try {
          embedding = JSON.parse(row.embedding_json) as number[];
        } catch {
          embedding = [];
        }
        const lexical = scoreTokenOverlap(trimmed, row.text);
        const score = hybridRetrievalScore(lexical, queryEmbedding, embedding);
        return { row, score };
      })
      .filter((entry) => entry.score >= MIN_RETRIEVAL_SCORE)
      .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
      .slice(0, limit)
      .map((entry) => `[${entry.row.category}] ${entry.row.title}: ${entry.row.text}`);
  }

  private replaceChunksForDocument(doc: BusinessKnowledgeDocument): void {
    const db = this.requireDb();
    db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(doc.id);
    const insert = db.prepare(
      `INSERT INTO chunks (id, document_id, title, category, text, embedding_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const parts = chunkDocumentText(doc.body);
    for (let index = 0; index < parts.length; index += 1) {
      const text = parts[index]!;
      insert.run(
        `${doc.id}:${index}`,
        doc.id,
        doc.title,
        doc.category,
        text,
        JSON.stringify(this.embedder(text)),
      );
    }
  }

  private async replaceChunksForDocumentAsync(doc: BusinessKnowledgeDocument): Promise<void> {
    if (!this.asyncEmbedder) {
      this.replaceChunksForDocument(doc);
      return;
    }
    const db = this.requireDb();
    db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(doc.id);
    const insert = db.prepare(
      `INSERT INTO chunks (id, document_id, title, category, text, embedding_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const parts = chunkDocumentText(doc.body);
    for (let index = 0; index < parts.length; index += 1) {
      const text = parts[index]!;
      const embedding = await this.asyncEmbedder(text);
      insert.run(
        `${doc.id}:${index}`,
        doc.id,
        doc.title,
        doc.category,
        text,
        JSON.stringify(embedding),
      );
    }
  }

  private scheduleAsyncReindexForDocument(doc: BusinessKnowledgeDocument): void {
    if (!this.asyncEmbedder) return;
    this.reindexQueue = this.reindexQueue
      .then(() => this.replaceChunksForDocumentAsync(doc))
      .catch((error) => {
        console.warn(
          `[business-knowledge] async reindex failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
