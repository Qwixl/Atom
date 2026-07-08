import { describe, expect, it } from "vitest";
import { createTextEmbedder } from "./createTextEmbedder.js";

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
});
