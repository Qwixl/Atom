import type { JsonObject } from "../types.js";
import type { GameEngine, GameMoveResult, GamePlayer, GameStatus } from "./engine.js";

/**
 * Reference GameEngine: tic-tac-toe. Owner is always X and moves first;
 * the agent is O. State is the 9-cell board — turn is derived from mark
 * counts so a stale or malicious props payload can never desync it.
 */

export type TttMark = "X" | "O" | null;

export interface TttState {
  board: TttMark[];
}

export interface TttMove {
  cell: number;
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const OWNER_MARK = "X";
const AGENT_MARK = "O";

function normalizeBoard(raw: unknown): TttMark[] {
  const next: TttMark[] = Array(9).fill(null);
  if (!Array.isArray(raw)) return next;
  for (let i = 0; i < 9; i++) {
    const mark = raw[i];
    next[i] = mark === "X" || mark === "O" ? mark : null;
  }
  return next;
}

function count(board: TttMark[], mark: TttMark): number {
  return board.filter((cell) => cell === mark).length;
}

function markFor(player: GamePlayer): TttMark {
  return player === "owner" ? OWNER_MARK : AGENT_MARK;
}

function winningLine(board: TttMark[]): { mark: TttMark; line: number[] } | null {
  for (const line of LINES) {
    const mark = board[line[0]];
    if (mark && mark === board[line[1]] && mark === board[line[2]]) {
      return { mark, line: [...line] };
    }
  }
  return null;
}

export class TictactoeEngine implements GameEngine<TttState, TttMove> {
  readonly moduleId = "games/tictactoe";

  initialState(): TttState {
    return { board: Array(9).fill(null) };
  }

  parseMove(payload: unknown): TttMove | null {
    if (typeof payload === "number" && Number.isInteger(payload)) return { cell: payload };
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const cell = (payload as Record<string, unknown>).cell;
      if (typeof cell === "number" && Number.isInteger(cell)) return { cell };
    }
    return null;
  }

  turn(state: TttState): GamePlayer {
    return count(state.board, OWNER_MARK) > count(state.board, AGENT_MARK)
      ? "agent"
      : "owner";
  }

  status(state: TttState): GameStatus {
    const win = winningLine(state.board);
    if (win) {
      return {
        phase: "won",
        winner: win.mark === OWNER_MARK ? "owner" : "agent",
        winningLine: win.line,
      };
    }
    if (state.board.every((cell) => cell !== null)) return { phase: "draw" };
    return { phase: "active" };
  }

  legalMoves(state: TttState, player: GamePlayer): TttMove[] {
    if (this.status(state).phase !== "active" || this.turn(state) !== player) return [];
    return state.board
      .map((mark, cell) => (mark === null ? { cell } : null))
      .filter((move): move is TttMove => move !== null);
  }

  applyMove(state: TttState, move: TttMove, player: GamePlayer): GameMoveResult<TttState> {
    if (this.status(state).phase !== "active") {
      return { ok: false, reason: "the game is already over" };
    }
    if (this.turn(state) !== player) {
      return { ok: false, reason: `it is not ${player}'s turn` };
    }
    if (move.cell < 0 || move.cell > 8 || !Number.isInteger(move.cell)) {
      return { ok: false, reason: `cell ${move.cell} is out of range (0-8)` };
    }
    if (state.board[move.cell] !== null) {
      return { ok: false, reason: `cell ${move.cell} is already taken` };
    }
    const board = [...state.board];
    board[move.cell] = markFor(player);
    return { ok: true, state: { board } };
  }

  toProps(state: TttState): JsonObject {
    const status = this.status(state);
    return {
      gameId: "ttt-shell",
      board: [...state.board],
      turn: this.turn(state) === "owner" ? OWNER_MARK : AGENT_MARK,
      status: status.phase,
      winner: status.winner ? markFor(status.winner) : null,
      winningLine: status.winningLine ?? null,
      myMark: OWNER_MARK,
    };
  }

  fromProps(props: JsonObject): TttState {
    return { board: normalizeBoard(props.board) };
  }

  agentView(state: TttState): JsonObject {
    const status = this.status(state);
    return {
      game: "tictactoe",
      youAre: AGENT_MARK,
      ownerIs: OWNER_MARK,
      board: [...state.board],
      turn: this.turn(state),
      phase: status.phase,
      legalCells: this.legalMoves(state, "agent").map((move) => move.cell),
    };
  }
}
