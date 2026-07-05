import { describe, expect, it } from "vitest";
import { createTextEmbedder } from "./createTextEmbedder.js";

describe("createTextEmbedder", () => {
  it("defaults to hash embedder", () => {
    const embed = createTextEmbedder({ kind: "hash" });
    expect(embed("hello world").length).toBeGreaterThan(10);
  });

  it("rejects api embedder until implemented", () => {
    expect(() => createTextEmbedder({ kind: "api" })).toThrow(/not implemented yet/i);
  });
});
