import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessKnowledgeBackend } from "./businessKnowledgeBackend.js";
import { SqliteBusinessKnowledgeStore } from "./sqliteBusinessKnowledgeStore.js";

describe("createBusinessKnowledgeBackend", () => {
  it("defaults to json backend", () => {
    const backend = createBusinessKnowledgeBackend({ kind: "json", dataPath: "/tmp/unused.json" });
    expect(typeof backend.retrieve).toBe("function");
  });

  it("creates sqlite backend (BK-D1)", () => {
    const backend = createBusinessKnowledgeBackend({
      kind: "sqlite",
      dataPath: path.join(tmpdir(), `atom-bk-${Date.now()}.sqlite`),
    });
    expect(backend).toBeInstanceOf(SqliteBusinessKnowledgeStore);
  });

  it("rejects unimplemented remote backend at startup", () => {
    expect(() =>
      createBusinessKnowledgeBackend({ kind: "remote", remoteUrl: "https://knowledge.example/api" }),
    ).toThrow(/not implemented yet/i);
  });
});

describe("SqliteBusinessKnowledgeStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("persists documents and retrieves by hybrid score", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "atom-sqlite-knowledge-"));
    dirs.push(dir);
    const store = new SqliteBusinessKnowledgeStore(path.join(dir, "knowledge.sqlite"));
    await store.load();
    store.upsert({
      title: "Return policy",
      category: "policy",
      body: "Customers may return unused goods within 30 days of purchase.",
    });
    store.upsert({
      title: "Opening hours",
      category: "general",
      body: "We open Tuesday through Sunday from 8am.",
    });

    const hits = store.retrieve("return unused goods");
    expect(hits.some((line) => /Return policy/i.test(line))).toBe(true);
    expect(store.list()).toHaveLength(2);

    const firstId = store.list()[0]!.id;
    store.close();

    const reloaded = new SqliteBusinessKnowledgeStore(path.join(dir, "knowledge.sqlite"));
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(2);
    expect(reloaded.get(firstId)?.title).toBeTruthy();
    reloaded.close();
  });
});
