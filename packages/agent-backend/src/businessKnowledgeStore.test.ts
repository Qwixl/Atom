import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BusinessKnowledgeStore, chunkDocumentText } from "./businessKnowledgeStore.js";

describe("BusinessKnowledgeStore", () => {
  it("chunks long documents and retrieves relevant excerpts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-business-knowledge-"));
    const store = new BusinessKnowledgeStore(path.join(dir, "business-knowledge.json"));
    store.upsert({
      id: "returns",
      title: "Returns policy",
      category: "policy",
      body: "Customers may return unused items within 30 days.\n\nRefunds are processed within 5 business days after inspection.",
    });
    store.upsert({
      id: "hours",
      title: "Opening hours",
      category: "faq",
      body: "We are open Monday to Friday 8am-6pm.",
    });
    const hits = store.retrieve("Can I return something after two weeks?", 3);
    expect(hits.some((hit) => hit.includes("30 days"))).toBe(true);
    expect(hits.some((hit) => hit.includes("Monday"))).toBe(false);
  });

  it("async reindex uses API embeddings when configured", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-business-knowledge-api-"));
    const asyncEmbedder = async (text: string) => {
      const base = text.includes("return") ? 1 : 0;
      return [base, 1 - base, 0.5];
    };
    const store = new BusinessKnowledgeStore(
      path.join(dir, "business-knowledge.json"),
      (text) => [text.length % 7, 0.1, 0.2],
      asyncEmbedder,
    );
    store.upsert({
      id: "returns",
      title: "Returns policy",
      category: "policy",
      body: "Customers may return unused items within 30 days.",
    });
    await store.reindexAsync();
    const hits = await store.retrieveAsync("return unused goods", 3);
    expect(hits.some((hit) => hit.includes("30 days"))).toBe(true);
  });
});
