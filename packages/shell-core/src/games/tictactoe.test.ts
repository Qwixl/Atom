import { describe, expect, it } from "vitest";
import { TictactoeEngine, type TttMark } from "./tictactoe.js";

const engine = new TictactoeEngine();

function stateOf(board: TttMark[]) {
  return { board };
}

describe("TictactoeEngine", () => {
  it("starts empty with the owner (X) to move", () => {
    const state = engine.initialState();
    expect(state.board).toEqual(Array(9).fill(null));
    expect(engine.turn(state)).toBe("owner");
    expect(engine.status(state).phase).toBe("active");
  });

  it("applies legal moves and alternates turns", () => {
    let state = engine.initialState();
    const owner = engine.applyMove(state, { cell: 4 }, "owner");
    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    state = owner.state;
    expect(engine.turn(state)).toBe("agent");

    const agent = engine.applyMove(state, { cell: 0 }, "agent");
    expect(agent.ok).toBe(true);
    if (!agent.ok) return;
    expect(engine.turn(agent.state)).toBe("owner");
  });

  it("rejects moving out of turn", () => {
    const state = engine.initialState();
    const result = engine.applyMove(state, { cell: 0 }, "agent");
    expect(result.ok).toBe(false);
  });

  it("rejects occupied cells — pieces can never be moved or overwritten", () => {
    const state = stateOf(["X", null, null, null, null, null, null, null, null]);
    const result = engine.applyMove(state, { cell: 0 }, "agent");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("already taken");
  });

  it("rejects out-of-range cells", () => {
    const state = engine.initialState();
    expect(engine.applyMove(state, { cell: 9 }, "owner").ok).toBe(false);
    expect(engine.applyMove(state, { cell: -1 }, "owner").ok).toBe(false);
  });

  it("detects a win with the winning line", () => {
    const state = stateOf(["O", "O", null, null, null, null, "X", "X", "X"]);
    const status = engine.status(state);
    expect(status.phase).toBe("won");
    expect(status.winner).toBe("owner");
    expect(status.winningLine).toEqual([6, 7, 8]);
  });

  it("detects a draw", () => {
    const state = stateOf(["X", "O", "X", "X", "O", "O", "O", "X", "X"]);
    expect(engine.status(state).phase).toBe("draw");
  });

  it("refuses moves after the game is over", () => {
    const state = stateOf(["X", "X", "X", "O", "O", null, null, null, null]);
    const result = engine.applyMove(state, { cell: 5 }, "agent");
    expect(result.ok).toBe(false);
  });

  it("lists legal moves only for the player on turn", () => {
    const state = stateOf(["X", null, null, null, null, null, null, null, null]);
    expect(engine.legalMoves(state, "agent").map((m) => m.cell)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(engine.legalMoves(state, "owner")).toEqual([]);
  });

  it("round-trips state through module props", () => {
    const state = stateOf(["X", null, null, null, "O", null, null, null, "X"]);
    const props = engine.toProps(state);
    expect(props.turn).toBe("O");
    expect(engine.fromProps(props)).toEqual(state);
  });

  it("sanitizes garbage props", () => {
    const state = engine.fromProps({ board: ["X", "Z", 3, {}, "O"] } as never);
    expect(state.board).toEqual(["X", null, null, null, "O", null, null, null, null]);
  });

  it("parses move payloads defensively", () => {
    expect(engine.parseMove({ cell: 3 })).toEqual({ cell: 3 });
    expect(engine.parseMove(5)).toEqual({ cell: 5 });
    expect(engine.parseMove({ cell: "3" })).toBeNull();
    expect(engine.parseMove("nope")).toBeNull();
  });

  it("agentView exposes legal cells for the agent turn", () => {
    const state = stateOf(["X", null, null, null, null, null, null, null, null]);
    const view = engine.agentView(state);
    expect(view.turn).toBe("agent");
    expect(view.legalCells).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
