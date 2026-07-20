import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createTextEmbedder,
  hybridRetrievalScore,
  scoreTokenOverlap,
  type TextEmbedder,
} from "@qwixl/owner-store";

export type SwarmMemoryKind = "observation" | "dialogue" | "plan" | "reflection" | "summary";

export interface SwarmCoreSheet {
  name: string;
  role: string;
  reasonForBeing: string;
  values: string[];
  hardBans: string[];
  voice: string;
}

export interface SwarmMutableSheet {
  mood: string;
  shortGoals: string[];
  /** Clamped trait values in [-1, 1]. */
  traits: Record<string, number>;
}

export interface SwarmMemoryRecord {
  id: string;
  kind: SwarmMemoryKind;
  text: string;
  importance: number;
  createdAt: string;
  counterpartDid?: string;
  placeId?: string;
}

const MIN_SCORE = 0.08;
const DEFAULT_TRAIT_CLAMP = 0.1;

/**
 * Per-NPC memory stream (D087 / AS-04).
 * SQLite + hash/API embeddings (same hybrid pattern as business knowledge).
 * Embedding column is ready for sqlite-vec acceleration later.
 */
export class SwarmMemoryStore {
  private readonly filePath: string;
  private readonly embedder: TextEmbedder;
  private db: DatabaseSync | null = null;

  constructor(filePath: string, embedder: TextEmbedder = createTextEmbedder()) {
    this.filePath = filePath;
    this.embedder = embedder;
  }

  async load(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS core_sheet (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mutable_sheet (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        importance REAL NOT NULL,
        created_at TEXT NOT NULL,
        counterpart_did TEXT,
        place_id TEXT,
        embedding_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_created ON memories(created_at);
      CREATE TABLE IF NOT EXISTS impressions (
        counterpart_did TEXT PRIMARY KEY,
        sentence TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dialogue_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        peer_did TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS dialogue_turns_peer ON dialogue_turns(peer_did, id);
    `);
  }

  /** Short-term DM turns for one peer (working memory). */
  appendDialogueTurn(peerDid: string, role: "user" | "assistant", text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !peerDid.trim()) return;
    this.requireDb()
      .prepare(
        `INSERT INTO dialogue_turns (peer_did, role, text, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(peerDid.trim(), role, trimmed.slice(0, 4000), new Date().toISOString());
  }

  recentDialogueTurns(
    peerDid: string,
    limit = 16,
  ): Array<{ role: "user" | "assistant"; text: string; createdAt: string }> {
    const rows = this.requireDb()
      .prepare(
        `SELECT role, text, created_at FROM dialogue_turns
         WHERE peer_did = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(peerDid.trim(), Math.max(1, limit)) as Array<{
      role: string;
      text: string;
      created_at: string;
    }>;
    return rows
      .reverse()
      .map((row) => ({
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: row.text,
        createdAt: row.created_at,
      }));
  }

  countDialogueTurns(peerDid: string): number {
    const row = this.requireDb()
      .prepare(`SELECT COUNT(*) AS n FROM dialogue_turns WHERE peer_did = ?`)
      .get(peerDid.trim()) as { n: number };
    return Number(row?.n ?? 0);
  }

  /**
   * Archive older short-term turns into a held-back summary memory, keep the newest `keepLast`.
   * Returns the outline text when a summary was written.
   */
  archiveDialogueOutline(
    peerDid: string,
    outline: string,
    keepLast = 6,
  ): { archived: boolean; summaryId?: string } {
    const did = peerDid.trim();
    const trimmed = outline.trim();
    if (!did || !trimmed) return { archived: false };
    const keep = Math.max(0, keepLast);
    const ids = this.requireDb()
      .prepare(`SELECT id FROM dialogue_turns WHERE peer_did = ? ORDER BY id DESC`)
      .all(did) as Array<{ id: number }>;
    if (ids.length <= keep) return { archived: false };
    const dropIds = ids.slice(keep).map((r) => r.id);
    const summaryId = `summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.appendMemory({
      id: summaryId,
      kind: "summary",
      text: trimmed.slice(0, 2000),
      importance: 0.55,
      counterpartDid: did,
    });
    const del = this.requireDb().prepare(`DELETE FROM dialogue_turns WHERE id = ?`);
    for (const id of dropIds) del.run(id);
    return { archived: true, summaryId };
  }

  /** Search held-back summary memories for a peer (vague recall). */
  retrieveSummaries(
    peerDid: string,
    query: string,
    limit = 6,
  ): SwarmMemoryRecord[] {
    const did = peerDid.trim();
    const trimmed = query.trim();
    if (!did || !trimmed) return [];
    const rows = this.requireDb()
      .prepare(
        `SELECT id, kind, text, importance, created_at, counterpart_did, place_id, embedding_json
         FROM memories WHERE kind = 'summary' AND counterpart_did = ?
         ORDER BY created_at DESC LIMIT 200`,
      )
      .all(did) as Array<{
      id: string;
      kind: string;
      text: string;
      importance: number;
      created_at: string;
      counterpart_did: string | null;
      place_id: string | null;
      embedding_json: string;
    }>;
    const queryEmbedding = this.embedder(trimmed);
    return rows
      .map((row) => {
        let embedding: number[] = [];
        try {
          embedding = JSON.parse(row.embedding_json) as number[];
        } catch {
          embedding = [];
        }
        const lexical = scoreTokenOverlap(trimmed, row.text);
        const hybrid = hybridRetrievalScore(lexical, queryEmbedding, embedding);
        return { row, combined: hybrid * 0.85 + row.importance * 0.15 };
      })
      .filter((item) => item.combined >= MIN_SCORE * 0.5 || rows.length <= 3)
      .sort((a, b) => b.combined - a.combined)
      .slice(0, limit)
      .map(({ row }) => ({
        id: row.id,
        kind: row.kind as SwarmMemoryKind,
        text: row.text,
        importance: row.importance,
        createdAt: row.created_at,
        counterpartDid: row.counterpart_did ?? undefined,
        placeId: row.place_id ?? undefined,
      }));
  }

  private requireDb(): DatabaseSync {
    if (!this.db) throw new Error("SwarmMemoryStore not loaded");
    return this.db;
  }

  /** Close the DB handle (tests / shutdown). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getCoreSheet(): SwarmCoreSheet | null {
    const row = this.requireDb()
      .prepare("SELECT json FROM core_sheet WHERE id = 1")
      .get() as { json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.json) as SwarmCoreSheet;
  }

  setCoreSheet(sheet: SwarmCoreSheet): void {
    this.requireDb()
      .prepare(
        `INSERT INTO core_sheet (id, json) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      )
      .run(JSON.stringify(sheet));
  }

  getMutableSheet(): SwarmMutableSheet {
    const row = this.requireDb()
      .prepare("SELECT json FROM mutable_sheet WHERE id = 1")
      .get() as { json: string } | undefined;
    if (!row) return { mood: "neutral", shortGoals: [], traits: {} };
    return JSON.parse(row.json) as SwarmMutableSheet;
  }

  /**
   * Apply a clamped mutable-sheet update. Trait absolute deltas capped per call.
   * Core sheet is never written here.
   */
  applyMutableUpdate(
    patch: Partial<SwarmMutableSheet>,
    traitDeltaClamp: number = DEFAULT_TRAIT_CLAMP,
  ): SwarmMutableSheet {
    const current = this.getMutableSheet();
    const nextTraits = { ...current.traits };
    if (patch.traits) {
      for (const [key, value] of Object.entries(patch.traits)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const prev = nextTraits[key] ?? 0;
        const desired = Math.max(-1, Math.min(1, value));
        const delta = Math.max(-traitDeltaClamp, Math.min(traitDeltaClamp, desired - prev));
        nextTraits[key] = Math.max(-1, Math.min(1, prev + delta));
      }
    }
    const next: SwarmMutableSheet = {
      mood: patch.mood?.trim() || current.mood,
      shortGoals: patch.shortGoals ?? current.shortGoals,
      traits: nextTraits,
    };
    this.requireDb()
      .prepare(
        `INSERT INTO mutable_sheet (id, json, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(next), new Date().toISOString());
    return next;
  }

  appendMemory(input: {
    id: string;
    kind: SwarmMemoryKind;
    text: string;
    importance: number;
    counterpartDid?: string;
    placeId?: string;
    createdAt?: string;
  }): void {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const embedding = this.embedder(input.text);
    this.requireDb()
      .prepare(
        `INSERT INTO memories (id, kind, text, importance, created_at, counterpart_did, place_id, embedding_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.kind,
        input.text,
        Math.max(0, Math.min(1, input.importance)),
        createdAt,
        input.counterpartDid ?? null,
        input.placeId ?? null,
        JSON.stringify(embedding),
      );
  }

  /**
   * Retrieve selective long-term memories. By default **excludes** `summary` rows
   * (held back for vague-recall triggers — D090).
   */
  retrieve(
    query: string,
    limit = 12,
    options?: { includeSummaries?: boolean },
  ): SwarmMemoryRecord[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = this.requireDb()
      .prepare(
        `SELECT id, kind, text, importance, created_at, counterpart_did, place_id, embedding_json
         FROM memories ORDER BY created_at DESC LIMIT 400`,
      )
      .all() as Array<{
      id: string;
      kind: string;
      text: string;
      importance: number;
      created_at: string;
      counterpart_did: string | null;
      place_id: string | null;
      embedding_json: string;
    }>;
    const queryEmbedding = this.embedder(trimmed);
    const now = Date.now();
    const includeSummaries = options?.includeSummaries === true;
    return rows
      .filter((row) => includeSummaries || row.kind !== "summary")
      .map((row) => {
        let embedding: number[] = [];
        try {
          embedding = JSON.parse(row.embedding_json) as number[];
        } catch {
          embedding = [];
        }
        const lexical = scoreTokenOverlap(trimmed, row.text);
        const hybrid = hybridRetrievalScore(lexical, queryEmbedding, embedding);
        const ageHours = Math.max(0, (now - Date.parse(row.created_at)) / 3_600_000);
        const recency = Math.exp(-ageHours / 72);
        const combined = hybrid * 0.7 + row.importance * 0.15 + recency * 0.15;
        return { row, combined };
      })
      .filter((item) => item.combined >= MIN_SCORE)
      .sort((a, b) => b.combined - a.combined)
      .slice(0, limit)
      .map(({ row }) => ({
        id: row.id,
        kind: row.kind as SwarmMemoryKind,
        text: row.text,
        importance: row.importance,
        createdAt: row.created_at,
        counterpartDid: row.counterpart_did ?? undefined,
        placeId: row.place_id ?? undefined,
      }));
  }

  setImpression(counterpartDid: string, sentence: string): void {
    this.requireDb()
      .prepare(
        `INSERT INTO impressions (counterpart_did, sentence, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(counterpart_did) DO UPDATE SET sentence = excluded.sentence, updated_at = excluded.updated_at`,
      )
      .run(counterpartDid, sentence.trim().slice(0, 280), new Date().toISOString());
  }

  getImpression(counterpartDid: string): string | null {
    const row = this.requireDb()
      .prepare("SELECT sentence FROM impressions WHERE counterpart_did = ?")
      .get(counterpartDid) as { sentence: string } | undefined;
    return row?.sentence ?? null;
  }

  /** Collapse dialogue rows older than `maxAgeDays` into one summary memory. */
  summarizeOldDialogues(maxAgeDays = 14): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const rows = this.requireDb()
      .prepare(
        `SELECT id, text FROM memories WHERE kind = 'dialogue' AND created_at < ? ORDER BY created_at ASC`,
      )
      .all(cutoff) as Array<{ id: string; text: string }>;
    if (rows.length === 0) return 0;
    const summaryText = `Summary of ${rows.length} older dialogues: ${rows
      .map((r) => r.text)
      .join(" · ")
      .slice(0, 2000)}`;
    this.appendMemory({
      id: `summary-${Date.now()}`,
      kind: "summary",
      text: summaryText,
      importance: 0.6,
    });
    const del = this.requireDb().prepare(`DELETE FROM memories WHERE id = ?`);
    for (const row of rows) del.run(row.id);
    return rows.length;
  }
}
