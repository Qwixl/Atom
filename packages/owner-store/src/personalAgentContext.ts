import type { OwnerStore } from "./OwnerStore.js";
import { ConversationMemoryIndex, scoreTokenOverlap } from "./conversationMemory.js";
import { formatRecordValue } from "./formatRecordValue.js";

/** AG-UI `forwardedProps` key for owner profile + memory (M10.4). */
export const ATOM_AGUI_PROFILE_PROP = "atomProfile";

const MIN_RECORD_SCORE = 0.06;

/** Profile slice + retrieved memory snippets for agent sessions (M10). */
export interface PersonalAgentContext {
  open: ReturnType<OwnerStore["contextSlice"]>["open"];
  guardedCategories: string[];
  summaryByCategory: ReturnType<OwnerStore["contextSlice"]>["summaryByCategory"];
  memorySnippets: string[];
}

export function retrieveRecordSnippets(
  store: OwnerStore,
  query: string,
  limit = 2,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return store
    .list()
    .filter((record) => !record.guarded)
    .map((record) => {
      const text = `${record.category} ${record.label} ${formatRecordValue(record.value)}`;
      return { record, score: scoreTokenOverlap(trimmed, text) };
    })
    .filter((entry) => entry.score >= MIN_RECORD_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(
      (entry) =>
        `profile ${entry.record.category}/${entry.record.label}: ${formatRecordValue(entry.record.value)}`,
    );
}

export function buildPersonalAgentContext(
  store: OwnerStore,
  memory: ConversationMemoryIndex,
  query?: string,
  memoryLimit = 3,
): PersonalAgentContext {
  const slice = store.contextSlice();
  const trimmed = query?.trim() ?? "";
  const conversationSnippets = trimmed
    ? memory.retrieve(trimmed, memoryLimit).map((chunk) => chunk.text)
    : [];
  const recordSnippets = trimmed ? retrieveRecordSnippets(store, trimmed, 2) : [];
  const snippets = [...recordSnippets, ...conversationSnippets].slice(0, memoryLimit + 2);
  return {
    open: slice.open,
    guardedCategories: slice.guardedCategories,
    summaryByCategory: slice.summaryByCategory,
    memorySnippets: snippets,
  };
}