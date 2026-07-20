/**
 * Minimal tic-tac-toe helpers for swarm NPC A2A play (Comms path).
 * Mirrors apps/shell/src/comms/tttLogic.ts bot heuristics.
 */

export type SwarmTttMark = "X" | "O" | null;
export type SwarmTttBoard = SwarmTttMark[];

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function emptySwarmTttBoard(): SwarmTttBoard {
  return Array(9).fill(null);
}

export function normalizeSwarmTttBoard(raw: unknown): SwarmTttBoard {
  const board = emptySwarmTttBoard();
  if (!Array.isArray(raw)) return board;
  for (let i = 0; i < 9; i++) {
    const mark = raw[i];
    board[i] = mark === "X" || mark === "O" ? mark : null;
  }
  return board;
}

function findWinningCell(board: SwarmTttBoard, mark: "X" | "O"): number | null {
  for (const [a, b, c] of WIN_LINES) {
    const line = [board[a], board[b], board[c]];
    if (!line.includes(mark)) continue;
    if (line.filter((cell) => cell === mark).length === 2 && line.includes(null)) {
      if (board[a] == null) return a;
      if (board[b] == null) return b;
      if (board[c] == null) return c;
    }
  }
  return null;
}

export function pickSwarmTttBotMove(board: SwarmTttBoard, botMark: "X" | "O"): number | null {
  const opponent = botMark === "X" ? "O" : "X";
  const win = findWinningCell(board, botMark);
  if (win != null) return win;
  const block = findWinningCell(board, opponent);
  if (block != null) return block;
  for (const preferred of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[preferred] == null) return preferred;
  }
  return null;
}

export function applySwarmTttMove(
  board: SwarmTttBoard,
  cell: number,
  mark: "X" | "O",
): { board: SwarmTttBoard; status: "active" | "won" | "draw"; winner?: "X" | "O"; turn: "X" | "O" } {
  if (cell < 0 || cell > 8 || board[cell]) {
    throw new Error("Invalid tic-tac-toe move");
  }
  const next = [...board] as SwarmTttBoard;
  next[cell] = mark;
  for (const [a, b, c] of WIN_LINES) {
    if (next[a] && next[a] === next[b] && next[a] === next[c]) {
      return { board: next, status: "won", winner: mark, turn: mark === "X" ? "O" : "X" };
    }
  }
  if (next.every((cellMark) => cellMark !== null)) {
    return { board: next, status: "draw", turn: mark === "X" ? "O" : "X" };
  }
  return { board: next, status: "active", turn: mark === "X" ? "O" : "X" };
}
