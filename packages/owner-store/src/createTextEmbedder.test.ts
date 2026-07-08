import { describe, expect, it } from "vitest";
import { createAsyncTextEmbedder } from "./apiTextEmbedding.js";
import { createOptionalAsyncTextEmbedder, createTextEmbedder } from "./createTextEmbedder.js";

describe("createTextEmbedder", () => {
  it("defaults to hash embedder", () => {
    const embed = createTextEmbedder({ kind: "hash" });
    expect(embed("hello world").length).toBeGreaterThan(10);
  });

  it("api embedder requires API key", () => {
    const prior = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.ATOM_EMBEDDER_API_KEY;
    expect(() => createTextEmbedder({ kind: "api" })).toThrow(/requires ATOM_EMBEDDER_API_KEY/i);
    if (prior) process.env.LLM_API_KEY = prior;
  });

  it("api embedder returns hash fallback vectors when key is set", () => {
    process.env.LLM_API_KEY = "test-key";
    const embed = createTextEmbedder({ kind: "api" });
    expect(embed("hello world").length).toBeGreaterThan(10);
  });

  it("optional async embedder is null for hash", () => {
    expect(createOptionalAsyncTextEmbedder({ kind: "hash" })).toBeNull();
  });

  it("async API embedder returns vectors from embeddings endpoint", async () => {
    const embed = createAsyncTextEmbedder({
      apiKey: "test-key",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    await expect(embed("hello")).resolves.toEqual([0.1, 0.2, 0.3]);
  });
});
