import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const OWNER_STORE_SCHEMA_VERSION = 1;

export interface PersistedOwnerStoreFile {
  schemaVersion: number;
  records: unknown[];
  proposals?: unknown[];
}

export class PersistedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistedFileError";
  }
}

async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

/** Read JSON with corruption recovery from a `.bak` sibling when the primary file fails parse. */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const candidates = [filePath, `${filePath}.bak`];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const raw = await readUtf8(candidate);
      return JSON.parse(raw) as T;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error && "code" in lastError && lastError.code === "ENOENT") {
    return null;
  }
  throw new PersistedFileError(
    `Failed to read ${filePath}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** Atomic write: temp file in same directory, backup previous, rename into place. */
export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, payload, { mode: 0o600 });
  try {
    try {
      await copyFile(filePath, `${filePath}.bak`);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
