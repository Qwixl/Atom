import {
  BattleshipsEngine,
  type BattleshipsMove,
  type BattleshipsPhase,
  type BattleshipsState,
} from "./battleships.js";
import type { GamePlayer } from "./engine.js";

/** Two-owner seating: A hosts the authoritative engine process (BK-10). */
export type BsSeat = "A" | "B";

export function seatToPlayer(seat: BsSeat): GamePlayer {
  return seat === "A" ? "owner" : "agent";
}

export function playerToSeat(player: GamePlayer): BsSeat {
  return player === "owner" ? "A" : "B";
}

export type BsOwnCell = "empty" | "ship" | "hit" | "miss";
export type BsFoeCell = "unknown" | "hit" | "miss";

export interface BsSeatBoardView {
  own: BsOwnCell[];
  foe: BsFoeCell[];
}

export interface BattleshipsPublicState {
  engine: true;
  size: number;
  shipLengths: number[];
  phase: BattleshipsPhase;
  turn: BsSeat;
  status: "active" | "won";
  winner?: BsSeat | null;
  ownPlacedA: boolean;
  ownPlacedB: boolean;
  boards: Record<BsSeat, BsSeatBoardView>;
}

export class BattleshipsA2AHost {
  readonly engine: BattleshipsEngine;
  state: BattleshipsState;

  constructor(engine = new BattleshipsEngine(), state?: BattleshipsState) {
    this.engine = engine;
    this.state = state ?? engine.initialState();
  }

  static create(): BattleshipsA2AHost {
    const engine = new BattleshipsEngine();
    return new BattleshipsA2AHost(engine, engine.initialState());
  }

  parseMove(payload: unknown): BattleshipsMove | null {
    return this.engine.parseMove(payload);
  }

  applyMove(seat: BsSeat, move: BattleshipsMove): { ok: true } | { ok: false; reason: string } {
    const result = this.engine.applyMove(this.state, move, seatToPlayer(seat));
    if (!result.ok) return result;
    this.state = result.state;
    return { ok: true };
  }

  turnSeat(): BsSeat {
    return playerToSeat(this.engine.turn(this.state));
  }

  toPublicState(): BattleshipsPublicState {
    const status = this.engine.status(this.state);
    const boardA = this.engine.toSeatBoardView(this.state, "A");
    const boardB = this.engine.toSeatBoardView(this.state, "B");
    return {
      engine: true,
      size: this.state.size,
      shipLengths: [...this.state.shipLengths],
      phase: this.state.phase,
      turn: this.turnSeat(),
      status: status.phase === "won" ? "won" : "active",
      winner: this.state.winner ? playerToSeat(this.state.winner) : null,
      ownPlacedA: this.state.ownerShips !== null,
      ownPlacedB: this.state.agentShips !== null,
      boards: { A: boardA, B: boardB },
    };
  }
}

export function parseBattleshipsPublicState(raw: unknown): BattleshipsPublicState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.engine !== true) return null;
  const phase =
    record.phase === "battle" || record.phase === "won" || record.phase === "setup"
      ? record.phase
      : null;
  if (!phase) return null;
  const turn = record.turn === "B" ? "B" : "A";
  const boardsRaw = record.boards;
  if (!boardsRaw || typeof boardsRaw !== "object" || Array.isArray(boardsRaw)) return null;
  const boardsRecord = boardsRaw as Record<string, unknown>;
  const boardA = parseSeatBoard(boardsRecord.A);
  const boardB = parseSeatBoard(boardsRecord.B);
  if (!boardA || !boardB) return null;
  const size = typeof record.size === "number" ? record.size : 6;
  const shipLengths = Array.isArray(record.shipLengths)
    ? record.shipLengths.filter((n): n is number => typeof n === "number")
    : [2, 2, 2];
  return {
    engine: true,
    size,
    shipLengths,
    phase,
    turn,
    status: record.status === "won" ? "won" : "active",
    winner: record.winner === "A" || record.winner === "B" ? record.winner : null,
    ownPlacedA: record.ownPlacedA === true,
    ownPlacedB: record.ownPlacedB === true,
    boards: { A: boardA, B: boardB },
  };
}

function parseSeatBoard(raw: unknown): BsSeatBoardView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.own) || !Array.isArray(record.foe)) return null;
  return {
    own: record.own.filter((cell): cell is BsOwnCell => typeof cell === "string"),
    foe: record.foe.filter((cell): cell is BsFoeCell => typeof cell === "string"),
  };
}

export function parseBattleshipsMovePayload(raw: unknown): BattleshipsMove | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.action === "place" && Array.isArray(record.cells)) {
    const cells = record.cells.filter((cell): cell is number => typeof cell === "number");
    return cells.length > 0 ? { action: "place", cells } : null;
  }
  if (record.action === "fire" && typeof record.cell === "number") {
    return { action: "fire", cell: record.cell };
  }
  return null;
}
