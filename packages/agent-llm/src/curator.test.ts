import { describe, expect, it } from "vitest";
import { parseCuratorResponse, shouldCurateTranscript } from "./curator.js";

describe("shouldCurateTranscript", () => {
  it("skips auto briefing-open turns", () => {
    expect(
      shouldCurateTranscript([
        {
          role: "user",
          text: "[briefing-open] Give me a concise daily roundup from my calendar and RSS snapshots.",
        },
        { role: "assistant", text: "Here is your roundup." },
      ]),
    ).toBe(false);
  });
});

describe("parseCuratorResponse splitProposals", () => {
  it("parses conditional split proposals", () => {
    const raw = JSON.stringify({
      proposals: [],
      signals: [],
      splitProposals: [
        {
          category: "preferences",
          label: "Cabin",
          defaultValue: "premium-economy",
          conditions: [{ contextTags: ["short-haul-with-kids"], value: "economy" }],
          reason: "Economy on short hops with kids",
          tier: "preference",
        },
      ],
    });
    const result = parseCuratorResponse(raw);
    expect(result.splitProposals).toHaveLength(1);
    expect(result.splitProposals[0]?.defaultValue).toBe("premium-economy");
    expect(result.splitProposals[0]?.conditions[0]?.value).toBe("economy");
  });
});
