import { describe, expect, it } from "vitest";
import {
  applySwarmTttMove,
  emptySwarmTttBoard,
  pickSwarmTttBotMove,
} from "./swarmTttLogic.js";

describe("swarmTttLogic", () => {
  it("blocks opponent wins", () => {
    const board = emptySwarmTttBoard();
    board[0] = "X";
    board[1] = "X";
    board[3] = "O";
    expect(pickSwarmTttBotMove(board, "O")).toBe(2);
  });

  it("applies moves and detects wins", () => {
    let board = emptySwarmTttBoard();
    board = applySwarmTttMove(board, 0, "X").board;
    board = applySwarmTttMove(board, 3, "O").board;
    board = applySwarmTttMove(board, 1, "X").board;
    board = applySwarmTttMove(board, 4, "O").board;
    const end = applySwarmTttMove(board, 2, "X");
    expect(end.status).toBe("won");
    expect(end.winner).toBe("X");
  });
});
