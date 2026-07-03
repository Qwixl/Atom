import { describe, expect, it } from "vitest";
import { OwnerStore } from "./OwnerStore.js";
import { ConversationMemoryIndex } from "./conversationMemory.js";
import { buildPersonalAgentContext, retrieveRecordSnippets } from "./personalAgentContext.js";

describe("personalAgentContext", () => {
  it("retrieves matching profile records by query", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Seat preference",
      value: "aisle",
      guarded: false,
    });
    const hits = retrieveRecordSnippets(store, "aisle seat on flight");
    expect(hits.some((h) => h.includes("Seat preference"))).toBe(true);
  });

  it("merges profile and conversation snippets", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Airline",
      value: "Example Air",
      guarded: false,
    });
    const memory = new ConversationMemoryIndex();
    memory.indexTurn([
      { role: "user", text: "Book Example Air to Berlin" },
      { role: "assistant", text: "Searching Berlin flights." },
    ]);
    const ctx = buildPersonalAgentContext(store, memory, "Example Air Berlin");
    expect(ctx.memorySnippets.length).toBeGreaterThan(0);
    expect(ctx.open.some((r) => r.label === "Airline")).toBe(true);
  });
});
