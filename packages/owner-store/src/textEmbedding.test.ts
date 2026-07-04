import { describe, expect, it } from "vitest";
import { cosineSimilarity, hashEmbedText, hybridRetrievalScore } from "./textEmbedding.js";

describe("textEmbedding", () => {
  it("produces unit-length vectors", () => {
    const vec = hashEmbedText("premium economy flights");
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("scores similar text higher than unrelated text", () => {
    const query = hashEmbedText("aisle seat long haul");
    const related = hashEmbedText("user prefers aisle seats on long flights");
    const unrelated = hashEmbedText("Tuesday standup meeting schedule");
    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });

  it("blends lexical and semantic scores in hybridRetrievalScore", () => {
    const lexical = 0.2;
    const query = hashEmbedText("hotel vienna");
    const doc = hashEmbedText("Hotel Sacher Vienna loved it");
    const hybrid = hybridRetrievalScore(lexical, query, doc);
    expect(hybrid).toBeGreaterThan(lexical * 0.4);
  });
});
