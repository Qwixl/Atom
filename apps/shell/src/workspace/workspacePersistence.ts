import { createTieredJsonPersistence, type JsonPersistence } from "@qwixl/shell-core";
import type { MemoryChunk, OwnerRecord, RecordProposal } from "@qwixl/owner-store";
import { workspaceStorageKey } from "./types.js";

const persistenceCache = new Map<string, JsonPersistence<unknown>>();

function cachedPersistence<T>(
  cacheKey: string,
  factory: () => JsonPersistence<T> & { hydrateFromIndexedDb(): Promise<T | undefined> },
): JsonPersistence<T> & { hydrateFromIndexedDb(): Promise<T | undefined> } {
  const existing = persistenceCache.get(cacheKey);
  if (existing) {
    return existing as JsonPersistence<T> & { hydrateFromIndexedDb(): Promise<T | undefined> };
  }
  const created = factory();
  persistenceCache.set(cacheKey, created as JsonPersistence<unknown>);
  return created;
}

export function workspaceOwnerRecordsPersistence(workspaceId: string) {
  const key = workspaceStorageKey("atom-owner-store", workspaceId);
  return cachedPersistence(key, () =>
    createTieredJsonPersistence<OwnerRecord[]>({
      key,
      validate: (value): value is OwnerRecord[] => Array.isArray(value),
    }),
  );
}

export function workspaceOwnerProposalsPersistence(workspaceId: string) {
  const key = workspaceStorageKey("atom-owner-proposals", workspaceId);
  return cachedPersistence(key, () =>
    createTieredJsonPersistence<RecordProposal[]>({
      key,
      validate: (value): value is RecordProposal[] => Array.isArray(value),
    }),
  );
}

export function workspaceConversationMemoryPersistence(workspaceId: string) {
  const key = workspaceStorageKey("atom-conversation-memory", workspaceId);
  return cachedPersistence(key, () =>
    createTieredJsonPersistence<MemoryChunk[]>({
      key,
      validate: (value): value is MemoryChunk[] => Array.isArray(value),
    }),
  );
}
