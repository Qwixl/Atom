import { describe, expect, it } from "vitest";
import { ConversationMemoryIndex, scoreTokenOverlap, tokenize } from "./conversationMemory.js";

describe("conversationMemory", () => {
  it("tokenizes and scores overlap", () => {
    expect(tokenize("Premium Economy seats")).toContain("premium");
    expect(scoreTokenOverlap("premium economy flight", "user: book premium economy")).toBeGreaterThan(0);
  });

  it("indexes turns and retrieves relevant chunks", () => {
    const memory = new ConversationMemoryIndex();
    memory.indexTurn([
      { role: "user", text: "I prefer aisle seats on long flights" },
      { role: "assistant", text: "Noted — aisle preference for long haul." },
    ]);
    memory.indexTurn([
      { role: "user", text: "Schedule standup for Tuesday" },
      { role: "assistant", text: "Here are three Tuesday slots." },
    ]);
    const hits = memory.retrieve("aisle seat long flight", 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.text.toLowerCase()).toContain("aisle");
  });

  it("stores embeddings on indexed chunks (M10.5)", () => {
    const memory = new ConversationMemoryIndex();
    const chunk = memory.indexTurn([{ role: "user", text: "Vienna hotel recommendation" }]);
    expect(chunk?.embedding?.length).toBeGreaterThan(0);
  });

  it("retrieves semantically related chunks beyond exact token overlap", () => {
    const memory = new ConversationMemoryIndex();
    memory.indexTurn([
      { role: "user", text: "I always book extra legroom on overnight flights" },
      { role: "assistant", text: "Noted your long-haul comfort preference." },
    ]);
    memory.indexTurn([
      { role: "user", text: "Add milk to the grocery list" },
      { role: "assistant", text: "Added." },
    ]);
    const hits = memory.retrieve("overnight flight comfort seating", 1);
    expect(hits[0]?.text.toLowerCase()).toContain("legroom");
  });

  it("indexes corrections separately", () => {
    const memory = new ConversationMemoryIndex();
    memory.indexCorrection("Declined meeting with Alex");
    const hits = memory.retrieve("declined meeting alex", 1);
    expect(hits[0]?.source).toBe("correction");
  });

  it("persists and caps chunk count", () => {
    let saved: readonly { id: string }[] = [];
    const memory = new ConversationMemoryIndex({
      maxChunks: 2,
      persist: (chunks) => {
        saved = chunks;
      },
    });
    memory.indexTurn([{ role: "user", text: "one" }]);
    memory.indexTurn([{ role: "user", text: "two" }]);
    memory.indexTurn([{ role: "user", text: "three" }]);
    expect(saved).toHaveLength(2);
    expect(memory.list()).toHaveLength(2);
    expect(memory.list()[0]?.text).toContain("two");
    expect(memory.list()[1]?.text).toContain("three");
  });
});
