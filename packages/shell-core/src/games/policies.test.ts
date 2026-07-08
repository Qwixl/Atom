import { describe, expect, it } from "vitest";
import type { Composition, CompositionNode, JsonObject } from "../types.js";
import type { FeedItem } from "../conversation.js";
import type { ResolvedSurface } from "../resolver.js";
import { TictactoeEngine } from "./tictactoe.js";
import {
  activeGameContext,
  allowCompositionDuringGame,
  gameModuleInComposition,
  sanitizeNewGameComposition,
} from "./policies.js";

const tttComposition: Composition = {
  version: 1,
  surfaceId: "ttt-1",
  root: {
    id: "board",
    component: "games/tictactoe",
    props: { board: ["X", "X", "X", null, null, null, null, null, null], status: "active" },
  },
};

function mockSurface(surfaceId: string, props: JsonObject): ResolvedSurface {
  return {
    surfaceId,
    intent: "Tic-tac-toe",
    degraded: false,
    root: {
      kind: "component",
      node: {
        id: "board",
        component: "games/tictactoe",
        props,
      },
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

describe("game policies", () => {
  it("detects game module in composition tree", () => {
    expect(gameModuleInComposition(tttComposition.root)).toBe("games/tictactoe");
  });

  it("resets new game compositions to engine initial state", () => {
    sanitizeNewGameComposition(tttComposition);
    expect(tttComposition.root.props?.board).toEqual(Array(9).fill(null));
    expect(tttComposition.root.props?.status).toBe("active");
  });

  it("blocks new game compositions while an active game is on the feed", () => {
    const feed: FeedItem[] = [
      {
        kind: "surface",
        id: "s1",
        surface: mockSurface("ttt-1", { status: "active", board: Array(9).fill(null) }),
      },
    ];
    expect(allowCompositionDuringGame(tttComposition, feed)).toBe(false);
  });

  it("allows non-game compositions while an active game is on the feed", () => {
    const scheduleComposition: Composition = {
      version: 1,
      surfaceId: "schedule-today",
      root: {
        id: "schedule-card",
        component: "core/card",
        props: { title: "Today" },
        children: [
          {
            id: "schedule-list",
            component: "core/list",
            props: { items: ["Standup 9am"] },
          },
        ],
      },
    };
    const feed: FeedItem[] = [
      {
        kind: "surface",
        id: "s1",
        surface: mockSurface("ttt-1", { status: "active", board: Array(9).fill(null) }),
      },
    ];
    expect(allowCompositionDuringGame(scheduleComposition, feed)).toBe(true);
  });

  it("allows compositions after the game ends", () => {
    const feed: FeedItem[] = [
      {
        kind: "surface",
        id: "s1",
        surface: mockSurface("ttt-1", { status: "won", board: Array(9).fill("X") }),
      },
    ];
    expect(allowCompositionDuringGame(tttComposition, feed)).toBe(true);
  });

  it("builds activeGameContext from engine agentView", () => {
    const engine = new TictactoeEngine();
    const state = engine.initialState();
    state.board[0] = "X";
    const ctx = activeGameContext({
      surface: mockSurface("ttt-1", engine.toProps(state)),
      embed: {
        moduleId: "games/tictactoe",
        nodeId: "board",
        props: engine.toProps(state),
      },
    });
    expect(ctx?.surfaceId).toBe("ttt-1");
    expect(ctx?.props).toMatchObject({ game: "tictactoe", youAre: "O", phase: "active" });
  });
});
