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

const LEGACY_KEYS = {
  records: "atom-owner-store",
  proposals: "atom-owner-proposals",
  memory: "atom-conversation-memory",
} as const;

/**
 * BK-D2: one-time migrate pre-workspace localStorage/IndexedDB blobs into the personal workspace partition.
 * Safe to call repeatedly — no-ops when personal keys already exist or legacy keys are empty.
 */
export async function migrateLegacyOwnerPersistenceToPersonal(): Promise<{
  migratedRecords: boolean;
  migratedProposals: boolean;
  migratedMemory: boolean;
}> {
  const result = { migratedRecords: false, migratedProposals: false, migratedMemory: false };
  if (typeof localStorage === "undefined") return result;

  const personalRecords = workspaceOwnerRecordsPersistence("personal");
  const personalProposals = workspaceOwnerProposalsPersistence("personal");
  const personalMemory = workspaceConversationMemoryPersistence("personal");

  await Promise.all([
    personalRecords.hydrateFromIndexedDb(),
    personalProposals.hydrateFromIndexedDb(),
    personalMemory.hydrateFromIndexedDb(),
  ]);

  const legacyRecords = createTieredJsonPersistence<OwnerRecord[]>({
    key: LEGACY_KEYS.records,
    validate: (value): value is OwnerRecord[] => Array.isArray(value),
  });
  const legacyProposals = createTieredJsonPersistence<RecordProposal[]>({
    key: LEGACY_KEYS.proposals,
    validate: (value): value is RecordProposal[] => Array.isArray(value),
  });
  const legacyMemory = createTieredJsonPersistence<MemoryChunk[]>({
    key: LEGACY_KEYS.memory,
    validate: (value): value is MemoryChunk[] => Array.isArray(value),
  });

  await Promise.all([
    legacyRecords.hydrateFromIndexedDb(),
    legacyProposals.hydrateFromIndexedDb(),
    legacyMemory.hydrateFromIndexedDb(),
  ]);

  if (!personalRecords.load()?.length) {
    const legacy = legacyRecords.load();
    if (legacy?.length) {
      personalRecords.save(legacy);
      legacyRecords.clear();
      result.migratedRecords = true;
    }
  }

  if (!personalProposals.load()?.length) {
    const legacy = legacyProposals.load();
    if (legacy?.length) {
      personalProposals.save(legacy);
      legacyProposals.clear();
      result.migratedProposals = true;
    }
  }

  if (!personalMemory.load()?.length) {
    const legacy = legacyMemory.load();
    if (legacy?.length) {
      personalMemory.save(legacy);
      legacyMemory.clear();
      result.migratedMemory = true;
    }
  }

  return result;
}
