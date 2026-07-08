import { describe, expect, it } from "vitest";
import {
  briefingTopicsFromInterestGraph,
  emergingInterestThemes,
  formatInterestConnectionsForPrompt,
  strengthenInterestConnection,
  themeFromTitle,
} from "./interestConnections.js";

describe("interestConnections", () => {
  it("normalizes themes from titles", () => {
    expect(themeFromTitle("Jordan Henderson injury update as England star")).toContain(
      "jordan",
    );
  });

  it("strengthens tangent edges and ranks emerging themes", () => {
    let connections = strengthenInterestConnection([], {
      themeA: "jordan henderson",
      themeB: "england football",
      kind: "tangent",
    }).connections;
    connections = strengthenInterestConnection(connections, {
      themeA: "jordan henderson",
      themeB: "premier league",
      kind: "return",
    }).connections;
    connections = strengthenInterestConnection(connections, {
      themeA: "ai regulation",
      themeB: "eu policy",
      kind: "explicit",
    }).connections;

    const emerging = emergingInterestThemes(connections, 3);
    expect(emerging.some((e) => e.theme === "jordan henderson")).toBe(true);
    expect(formatInterestConnectionsForPrompt(connections)).toContain("↔");
  });

  it("suggests briefing topics not already configured", () => {
    const { connections } = strengthenInterestConnection([], {
      themeA: "ai regulation",
      themeB: "eu policy",
      kind: "manual",
    });
    expect(briefingTopicsFromInterestGraph(connections, ["ai regulation"], 3)).toEqual([
      "eu policy",
    ]);
  });
});
