import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";

export async function loadJsonStore<T>(
  filePath: string,
  apply: (file: T | null) => void,
): Promise<void> {
  const file = await readJsonFile<T>(filePath);
  apply(file);
}

export function createJsonStoreWriter<T extends { schemaVersion: number }>(
  filePath: string,
  schemaVersion: number,
  tag: string,
  snapshot: () => Omit<T, "schemaVersion">,
): { persist: () => void } {
  let persistQueue: Promise<void> = Promise.resolve();
  return {
    persist(): void {
      persistQueue = persistQueue
        .then(async () => {
          await atomicWriteJson(filePath, {
            schemaVersion,
            ...snapshot(),
          } as T);
        })
        .catch((error) => {
          console.warn(
            `[${tag}] persist failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },
  };
}
