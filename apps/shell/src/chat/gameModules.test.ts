import { describe, expect, it } from "vitest";
import type { ResolvedSurface } from "@qwixl/shell-core";
import { findActiveGameInFeed, isGameModule, isGameEnded } from "./gameModules.js";

describe("gameModules", () => {
  it("recognises game module ids", () => {
    expect(isGameModule("games/tictactoe")).toBe(true);
    expect(isGameModule("scheduling/meeting-picker")).toBe(false);
  });

  it("detects ended games", () => {
    expect(isGameEnded({ status: "won" })).toBe(true);
    expect(isGameEnded({ status: "active" })).toBe(false);
  });

  it("finds active game surface on feed", () => {
    const surface: ResolvedSurface = {
      surfaceId: "ttt-1",
      root: {
        kind: "component",
        node: { id: "board", component: "games/tictactoe", props: { status: "active" } },
        entry: {
          origin: "module",
          spec: { name: "games/tictactoe", semanticRole: "input/game-board", moduleId: "games/tictactoe" },
        },
        children: [],
      },
      degraded: false,
    };
    const feed = [
      { kind: "user" as const, id: "u1", text: "play" },
      { kind: "surface" as const, id: "s1", surface },
    ];
    expect(findActiveGameInFeed(feed)?.surface.surfaceId).toBe("ttt-1");
  });
});
