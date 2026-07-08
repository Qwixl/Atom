/** Async persistence for large browser blobs (M10.7). */
import type { JsonPersistence } from "./persistence.js";

export interface AsyncJsonPersistence<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "atom-shell";
const DB_VERSION = 1;
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

/** M10.7 — durable browser persistence with larger quota than localStorage. */
export function createIndexedDbPersistence<T>(options: {
  key: string;
  parse: (raw: unknown) => T | null;
  serialize: (value: T) => unknown;
}): AsyncJsonPersistence<T> {
  return {
    async load(): Promise<T | null> {
      try {
        const db = await openDb();
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const request = store.get(options.key);
        const value = await new Promise<unknown>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
        });
        db.close();
        return value === undefined ? null : options.parse(value);
      } catch {
        return null;
      }
    },
    async save(value: T): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(options.serialize(value), options.key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      });
      db.close();
    },
    async clear(): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(options.key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
      });
      db.close();
    },
  };
}

/**
 * Dual-write persistence: localStorage for sync reads, IndexedDB for larger quota (M10.7).
 * Call hydrateFromIndexedDb() on startup when localStorage is empty to recover prior IDB data.
 */
export function createTieredJsonPersistence<T>(options: {
  key: string;
  validate: (value: unknown) => value is T;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}): JsonPersistence<T> & { hydrateFromIndexedDb(): Promise<T | undefined> } {
  const idb = createIndexedDbPersistence<T>({
    key: options.key,
    parse: (raw) => (options.validate(raw) ? raw : null),
    serialize: (value) => value,
  });

  let localStorageApi: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  if (options.storage) {
    localStorageApi = options.storage;
  } else if (typeof globalThis.localStorage !== "undefined") {
    localStorageApi = globalThis.localStorage;
  }

  function load(): T | undefined {
    if (!localStorageApi) return undefined;
    try {
      const raw = localStorageApi.getItem(options.key);
      if (!raw) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return options.validate(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function save(value: T): void {
    if (localStorageApi) {
      try {
        localStorageApi.setItem(options.key, JSON.stringify(value));
      } catch {
        // Best-effort — IndexedDB may still succeed.
      }
    }
    void idb.save(value);
  }

  function clear(): void {
    if (localStorageApi) {
      try {
        localStorageApi.removeItem(options.key);
      } catch {
        // Best-effort.
      }
    }
    void idb.clear();
  }

  async function hydrateFromIndexedDb(): Promise<T | undefined> {
    const fromLocal = load();
    if (fromLocal !== undefined) return fromLocal;
    const fromIdb = await idb.load();
    if (fromIdb === null) return undefined;
    if (localStorageApi) {
      try {
        localStorageApi.setItem(options.key, JSON.stringify(fromIdb));
      } catch {
        // IndexedDB remains source of truth.
      }
    }
    return fromIdb;
  }

  return { load, save, clear, hydrateFromIndexedDb };
}
