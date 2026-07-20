import { describe, expect, it } from "vitest";
import {
  formatVagueRecallBlock,
  isVagueRecallPrompt,
  outlineFromTurns,
} from "./swarmRecall.js";

describe("swarmRecall", () => {
  it("detects remember-style prompts", () => {
    expect(isVagueRecallPrompt("Do you remember my usual order?")).toBe(true);
    expect(isVagueRecallPrompt("remember when we talked about oat milk")).toBe(true);
    expect(isVagueRecallPrompt("How is the coffee today?")).toBe(false);
  });

  it("builds outline snippets", () => {
    const outline = outlineFromTurns([
      { role: "user", text: "I like oat milk" },
      { role: "assistant", text: "Got it — oat milk latte next time." },
    ]);
    expect(outline).toContain("They: I like oat milk");
    expect(outline).toContain("You: Got it");
  });

  it("formats empty vague recall honestly", () => {
    expect(formatVagueRecallBlock([])).toMatch(/do not clearly remember/i);
  });
});
