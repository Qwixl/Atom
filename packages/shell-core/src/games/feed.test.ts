import { describe, expect, it } from "vitest";
import type { ResolvedSurface } from "../resolver.js";
import type { JsonObject } from "../types.js";
import { findActiveGameInFeed, isActiveShellGameOnFeed } from "./feed.js";

function mockSurface(props: JsonObject): ResolvedSurface {
  return {
    surfaceId: "ttt-1",
    intent: "Tic-tac-toe",
    degraded: false,
    root: {
      kind: "component",
      node: { id: "board", component: "games/tictactoe", props },
      entry: {
        origin: "module",
        spec: {
          name: "games/tictactoe",
          semanticRole: "input/game-board",
          moduleId: "games/tictactoe",
        },
      },
      children: [],
    },
  };
}

describe("isActiveShellGameOnFeed", () => {
  it("is true for an active shell game surface", () => {
    const feed = [
      { kind: "surface" as const, id: "s1", surface: mockSurface({ status: "active" }) },
    ];
    expect(isActiveShellGameOnFeed(feed)).toBe(true);
  });

  it("is false when the game has ended", () => {
    const feed = [
      { kind: "surface" as const, id: "s1", surface: mockSurface({ status: "won" }) },
    ];
    expect(isActiveShellGameOnFeed(feed)).toBe(false);
  });
});

describe("findActiveGameInFeed", () => {
  it("returns null when the latest surface is not a registered game", () => {
    const feed = [
      {
        kind: "surface" as const,
        id: "s1",
        surface: {
          ...mockSurface({ status: "active" }),
          root: {
            kind: "component" as const,
            node: { id: "x", component: "scheduling/meeting-picker", props: {} },
            entry: {
              origin: "module" as const,
              spec: {
                name: "scheduling/meeting-picker",
                semanticRole: "input/schedule",
                moduleId: "scheduling/meeting-picker",
              },
            },
            children: [],
          },
        },
      },
    ];
    expect(findActiveGameInFeed(feed)).toBeNull();
  });
});
