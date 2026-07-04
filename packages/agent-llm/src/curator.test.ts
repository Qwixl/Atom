import { describe, expect, it } from "vitest";
import { parseCuratorResponse } from "./curator.js";

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
