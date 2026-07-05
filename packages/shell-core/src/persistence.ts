/** v1 browser persistence backend. IndexedDB planned for large owner profiles and memory indexes. */
export type JsonPersistenceBackendKind = "localStorage";

/** Best-effort JSON persistence for browser hosts. shell-core stays storage-agnostic;
 * embedders may pass a custom Storage or skip persistence entirely.
 * v1 uses localStorage only — silent failure on quota (see 20-v1-production-gaps.md). */

export interface JsonPersistence<T> {
  load(): T | undefined;
  save(value: T): void;
  clear(): void;
}

export interface JsonPersistenceOptions<T> {
  key: string;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  validate?: (value: unknown) => value is T;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
  if (typeof globalThis.localStorage === "undefined") return undefined;
  return globalThis.localStorage;
}

/** Load JSON from storage; returns undefined on missing, invalid, or storage errors. */
export function loadJsonFromStorage<T>(
  key: string,
  validate?: (value: unknown) => value is T,
  storage: Pick<Storage, "getItem"> = defaultStorage() as Storage,
): T | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return undefined;
    return parsed as T;
  } catch {
    return undefined;
  }
}

/** Persist JSON; silently no-ops when storage is unavailable or quota is exceeded. */
export function saveJsonToStorage(
  key: string,
  value: unknown,
  storage: Pick<Storage, "setItem"> = defaultStorage() as Storage,
): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort in v1.
  }
}

export function loadStringFromStorage(
  key: string,
  storage: Pick<Storage, "getItem"> = defaultStorage() as Storage,
): string | undefined {
  try {
    const raw = storage.getItem(key);
    return raw ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveStringToStorage(
  key: string,
  value: string,
  storage: Pick<Storage, "setItem"> = defaultStorage() as Storage,
): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Best-effort in v1.
  }
}

export function loadBooleanFromStorage(
  key: string,
  defaultValue: boolean,
  storage: Pick<Storage, "getItem"> = defaultStorage() as Storage,
): boolean {
  const raw = loadStringFromStorage(key, storage);
  if (raw === undefined) return defaultValue;
  return raw === "true";
}

/** Create a load/save/clear handle for a typed JSON blob. */
export function createJsonPersistence<T>(options: JsonPersistenceOptions<T>): JsonPersistence<T> {
  const storage = options.storage ?? defaultStorage();
  return {
    load(): T | undefined {
      if (!storage) return undefined;
      return loadJsonFromStorage(options.key, options.validate, storage);
    },
    save(value: T): void {
      if (!storage) return;
      saveJsonToStorage(options.key, value, storage);
    },
    clear(): void {
      if (!storage) return;
      try {
        storage.removeItem(options.key);
      } catch {
        // Best-effort.
      }
    },
  };
}

/** Attestation log persistence hook factory. */
export function createAttestationPersistence(
  key = "atom-attestation",
): JsonPersistence<unknown[]> {
  return createJsonPersistence({
    key,
    validate: (value): value is unknown[] => Array.isArray(value),
  });
}
