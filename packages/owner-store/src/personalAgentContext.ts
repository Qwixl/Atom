import type { OwnerStore } from "./OwnerStore.js";
import { resolveRecordValue } from "./conditionalValue.js";
import { ConversationMemoryIndex, scoreTokenOverlap } from "./conversationMemory.js";
import { formatRecordValue } from "./formatRecordValue.js";
import { hashEmbedText, hybridRetrievalScore, type TextEmbedder } from "./textEmbedding.js";

/** AG-UI `forwardedProps` key for owner profile + memory (M10.4). */
export const ATOM_AGUI_PROFILE_PROP = "atomProfile";

const MIN_RECORD_SCORE = 0.06;

export interface PersonalAgentContextOptions {
  memoryLimit?: number;
  sessionContextTags?: readonly string[];
  embedder?: TextEmbedder;
}

/** Profile slice + retrieved memory snippets for agent sessions (M10). */
export interface PersonalAgentContext {
  open: ReturnType<OwnerStore["contextSlice"]>["open"];
  guardedCategories: string[];
  summaryByCategory: ReturnType<OwnerStore["contextSlice"]>["summaryByCategory"];
  memorySnippets: string[];
  sessionContextTags: string[];
}

function scoreRecordText(query: string, text: string, embedder: TextEmbedder): number {
  const lexical = scoreTokenOverlap(query, text);
  const queryEmbedding = embedder(query);
  const documentEmbedding = embedder(text);
  return hybridRetrievalScore(lexical, queryEmbedding, documentEmbedding);
}

export function retrieveRecordSnippets(
  store: OwnerStore,
  query: string,
  limit = 2,
  options: { sessionContextTags?: readonly string[]; embedder?: TextEmbedder } = {},
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const embedder = options.embedder ?? hashEmbedText;
  const sessionTags = options.sessionContextTags ?? [];
  return store
    .list()
    .filter((record) => !record.guarded)
    .map((record) => {
      const resolved = resolveRecordValue(record, sessionTags);
      const text = `${record.category} ${record.label} ${formatRecordValue(resolved)}`;
      return { record, resolved, score: scoreRecordText(trimmed, text, embedder) };
    })
    .filter((entry) => entry.score >= MIN_RECORD_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(
      (entry) =>
        `profile ${entry.record.category}/${entry.record.label}: ${formatRecordValue(entry.resolved)}`,
    );
}

export function buildPersonalAgentContext(
  store: OwnerStore,
  memory: ConversationMemoryIndex,
  query?: string,
  memoryLimitOrOptions: number | PersonalAgentContextOptions = 3,
): PersonalAgentContext {
  const options =
    typeof memoryLimitOrOptions === "number"
      ? { memoryLimit: memoryLimitOrOptions }
      : memoryLimitOrOptions;
  const memoryLimit = options.memoryLimit ?? 3;
  const sessionContextTags = options.sessionContextTags ?? [];
  const slice = store.contextSlice(sessionContextTags);
  const trimmed = query?.trim() ?? "";
  const retrieveOptions = { sessionContextTags, embedder: options.embedder };
  const conversationSnippets = trimmed
    ? memory.retrieve(trimmed, memoryLimit).map((chunk) => chunk.text)
    : [];
  const recordSnippets = trimmed
    ? retrieveRecordSnippets(store, trimmed, 2, retrieveOptions)
    : [];
  const snippets = [...recordSnippets, ...conversationSnippets].slice(0, memoryLimit + 2);
  return {
    open: slice.open,
    guardedCategories: slice.guardedCategories,
    summaryByCategory: slice.summaryByCategory,
    memorySnippets: snippets,
    sessionContextTags: [...sessionContextTags],
  };
}
