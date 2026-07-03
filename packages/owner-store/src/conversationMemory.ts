/** One indexed excerpt from a past turn or owner correction (M10 RAG v1). */
export interface MemoryChunk {
  id: string;
  at: number;
  text: string;
  source: "conversation" | "correction";
}

export interface ConversationMemoryOptions {
  restore?: MemoryChunk[];
  persist?: (chunks: readonly MemoryChunk[]) => void;
  /** Cap stored chunks (oldest dropped). Default 200. */
  maxChunks?: number;
}

const DEFAULT_MAX_CHUNKS = 200;
const MIN_RETRIEVAL_SCORE = 0.08;

/** Lowercase alphanumeric tokens for lexical overlap retrieval. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function scoreTokenOverlap(query: string, document: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return 0;
  const docTokens = tokenize(document);
  if (docTokens.length === 0) return 0;
  let hits = 0;
  for (const token of docTokens) {
    if (queryTokens.has(token)) hits += 1;
  }
  return hits / (queryTokens.size + docTokens.length - hits);
}

/**
 * Local conversation + correction index. v1: lexical overlap retrieval
 * (no embedding API). Precedent: classic IR / BM25-lite for on-device RAG.
 */
export class ConversationMemoryIndex {
  private chunks: MemoryChunk[] = [];
  private readonly persist?: (chunks: readonly MemoryChunk[]) => void;
  private readonly maxChunks: number;

  constructor(options: ConversationMemoryOptions = {}) {
    this.chunks = [...(options.restore ?? [])];
    this.persist = options.persist;
    this.maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  }

  list(): readonly MemoryChunk[] {
    return this.chunks;
  }

  indexTurn(transcript: ReadonlyArray<{ role: string; text: string }>): MemoryChunk | null {
    const lines = transcript
      .map((line) => `${line.role}: ${line.text.trim()}`)
      .filter((line) => line.length > line.indexOf(":") + 2);
    if (lines.length === 0) return null;
    return this.append(lines.join("\n"), "conversation");
  }

  indexCorrection(summary: string): MemoryChunk | null {
    const text = summary.trim();
    if (!text) return null;
    return this.append(`correction: ${text}`, "correction");
  }

  retrieve(query: string, limit = 3): MemoryChunk[] {
    const trimmed = query.trim();
    if (!trimmed || this.chunks.length === 0) return [];
    const scored = this.chunks
      .map((chunk) => ({ chunk, score: scoreTokenOverlap(trimmed, chunk.text) }))
      .filter((entry) => entry.score >= MIN_RETRIEVAL_SCORE)
      .sort((a, b) => b.score - a.score || b.chunk.at - a.chunk.at);
    return scored.slice(0, limit).map((entry) => entry.chunk);
  }

  private append(text: string, source: MemoryChunk["source"]): MemoryChunk {
    const chunk: MemoryChunk = {
      id: crypto.randomUUID(),
      at: Date.now(),
      text,
      source,
    };
    this.chunks.push(chunk);
    if (this.chunks.length > this.maxChunks) {
      this.chunks = this.chunks.slice(this.chunks.length - this.maxChunks);
    }
    this.persist?.(this.chunks);
    return chunk;
  }
}
