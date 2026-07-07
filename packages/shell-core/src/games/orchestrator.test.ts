import { describe, expect, it } from "vitest";
import type { JsonObject } from "../types.js";
import { TictactoeEngine, type TttMark } from "./tictactoe.js";
import type { ActiveChatGame } from "./feed.js";
import { GAME_MOVE_FALLBACK_TEXT, GameOrchestrator } from "./orchestrator.js";
import type { GameOrchestratorCallbacks } from "./orchestrator.js";

function activeGame(props: JsonObject, surfaceId = "ttt-1"): ActiveChatGame {
  return {
    surface: {
      surfaceId,
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
    },
    embed: {
      moduleId: "games/tictactoe",
      nodeId: "board",
      props,
    },
  };
}

function mockCallbacks(game: ActiveChatGame | null): GameOrchestratorCallbacks & {
  commits: Array<{ surfaceId: string; moduleId: string; props: JsonObject }>;
  prompts: string[];
  texts: string[];
} {
  let current = game;
  const commits: Array<{ surfaceId: string; moduleId: string; props: JsonObject }> = [];
  const prompts: string[] = [];
  const texts: string[] = [];
  return {
    commits,
    prompts,
    texts,
    getActiveGame: () => current,
    commitProps: (surfaceId, moduleId, props) => {
      commits.push({ surfaceId, moduleId, props: { ...props } });
      if (current) {
        current = {
          ...current,
          embed: { ...current.embed, props: { ...props } },
          surface: {
            ...current.surface,
            root: {
              ...current.surface.root,
              node: { ...current.surface.root.node, props: { ...props } },
            },
          },
        };
      }
    },
    appendAgentText: (text) => texts.push(text),
    requestAgentTurn: (prompt) => prompts.push(prompt),
  };
}

describe("GameOrchestrator", () => {
  it("applies a valid agent game-move", () => {
    const engine = new TictactoeEngine();
    let state = engine.initialState();
    state.board[0] = "X";
    const game = activeGame(engine.toProps(state));
    const orch = new GameOrchestrator();
    const cb = mockCallbacks(game);
    orch.handleAgentMove("ttt-1", { cell: 4 }, cb);
    expect(cb.commits).toHaveLength(1);
    expect((cb.commits[0]?.props.board as TttMark[])?.[4]).toBe("O");
  });

  it("rejects agent move for wrong surfaceId", () => {
    const engine = new TictactoeEngine();
    let state = engine.initialState();
    state.board[0] = "X";
    const game = activeGame(engine.toProps(state));
    const orch = new GameOrchestrator();
    const cb = mockCallbacks(game);
    orch.handleAgentMove("other", { cell: 4 }, cb);
    expect(cb.commits).toHaveLength(0);
    expect(orch.ensureAgentMove(cb)).toBe(true);
    expect(cb.prompts[0]).toContain("that surfaceId is not the active game");
  });

  it("handles owner move and requests agent turn", () => {
    const engine = new TictactoeEngine();
    const game = activeGame(engine.toProps(engine.initialState()));
    const orch = new GameOrchestrator();
    const cb = mockCallbacks(game);
    const result = orch.handleOwnerUiEvent("tttMove", { cell: 0 }, game, game.embed.props, cb);
    expect(result.handled).toBe(true);
    expect((cb.commits[0]?.props.board as TttMark[])?.[0]).toBe("X");
    expect(cb.prompts).toHaveLength(1);
    expect(cb.prompts[0]).toContain("[game-turn]");
  });

  it("retries once then plays disclosed fallback", () => {
    const engine = new TictactoeEngine();
    let state = engine.initialState();
    state.board[0] = "X";
    const game = activeGame(engine.toProps(state));
    const orch = new GameOrchestrator();
    const cb = mockCallbacks(game);
    orch.handleAgentMove("ttt-1", { cell: 0 }, cb);
    expect(orch.ensureAgentMove(cb)).toBe(true);
    expect(cb.prompts).toHaveLength(1);
    expect(orch.ensureAgentMove(cb)).toBe(false);
    expect(cb.commits).toHaveLength(1);
    expect((cb.commits[0]?.props.board as TttMark[]).some((m) => m === "O")).toBe(true);
    expect(cb.texts).toContain(GAME_MOVE_FALLBACK_TEXT);
  });

  it("restarts on owner restart event", () => {
    const engine = new TictactoeEngine();
    let state = engine.initialState();
    state.board[0] = "X";
    const game = activeGame(engine.toProps(state));
    const orch = new GameOrchestrator();
    const cb = mockCallbacks(game);
    const result = orch.handleOwnerUiEvent("tttStart", {}, game, game.embed.props, cb);
    expect(result).toEqual({ handled: true, reopenModal: true });
    expect(cb.commits[0]?.props.board).toEqual(Array(9).fill(null));
  });
});
