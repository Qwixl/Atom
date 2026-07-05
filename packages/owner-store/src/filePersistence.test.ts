import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteJson, readJsonFile } from "./filePersistence.js";

describe("filePersistence", () => {
  it("round-trips JSON via atomic write", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-owner-store-"));
    const filePath = path.join(dir, "store.json");
    await atomicWriteJson(filePath, { schemaVersion: 1, records: [{ id: "a" }] });
    const loaded = await readJsonFile<{ records: { id: string }[] }>(filePath);
    expect(loaded?.records[0]?.id).toBe("a");
  });

  it("recovers from backup when primary JSON is corrupt", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-owner-store-"));
    const filePath = path.join(dir, "store.json");
    await atomicWriteJson(filePath, { ok: true });
    await atomicWriteJson(filePath, { ok: true, pass: 2 });
    await writeFile(filePath, "{not json", "utf8");
    const loaded = await readJsonFile<{ ok: boolean }>(filePath);
    expect(loaded?.ok).toBe(true);
  });
});
