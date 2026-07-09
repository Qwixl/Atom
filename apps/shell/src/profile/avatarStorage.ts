const AVATAR_DB = "atom-profile-media";
const AVATAR_STORE = "avatars";
const AVATAR_KEY = "owner-avatar";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AVATAR_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open avatar store"));
  });
}

/** Persist avatar blob locally (IndexedDB) for offline display. */
export async function saveLocalAvatarBlob(blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).put(blob, AVATAR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save avatar"));
  });
  db.close();
}

export async function loadLocalAvatarBlob(): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readonly");
    const req = tx.objectStore(AVATAR_STORE).get(AVATAR_KEY);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to load avatar"));
  });
  db.close();
  return blob;
}

export async function clearLocalAvatarBlob(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).delete(AVATAR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear avatar"));
  });
  db.close();
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function readFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file."));
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return Promise.reject(new Error("Image must be under 2 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
