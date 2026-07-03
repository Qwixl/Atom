import { describe, expect, it } from "vitest";
import { ATOM_AGUI_PROFILE_PROP } from "@qwixl/owner-store";
import { profileFromRunAgentInput } from "./profileFromInput.js";

describe("profileFromRunAgentInput", () => {
  it("reads atomProfile from forwardedProps", () => {
    const profile = {
      open: [{ category: "preferences", label: "Seat", value: "aisle", confidence: 0.8, strength: 0.7, tier: "preference" as const, contextTags: [] }],
      guardedCategories: [],
      summaryByCategory: {},
      memorySnippets: ["user: aisle please"],
    };
    const input = {
      threadId: "t",
      runId: "r",
      messages: [],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { [ATOM_AGUI_PROFILE_PROP]: profile },
    };
    expect(profileFromRunAgentInput(input)?.memorySnippets).toEqual(["user: aisle please"]);
  });

  it("falls back to env profile", () => {
    const fallback = { open: [], guardedCategories: ["identity"] };
    const input = {
      threadId: "t",
      runId: "r",
      messages: [],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    };
    expect(profileFromRunAgentInput(input, fallback)?.guardedCategories).toEqual(["identity"]);
  });
});
