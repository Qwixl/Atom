import type { JsonObject } from "../types.js";
import type { GameEngine, GameMoveResult, GamePlayer, GameStatus } from "./engine.js";

/**
 * Shell-arbitrated battleships (Chat: owner vs agent).
 * Engine owns both fleets and hit/miss; module + agent only propose place/fire.
 * Module props expose a filtered view; full state rides in `_state` for host recovery
 * (PvE trust-the-host; two-owner A2A host process is a later seating of the same engine).
 */

export interface BattleshipsLevel {
  size: number;
  shipLengths: readonly number[];
}

/** Level 1 — matches the former A2A scaffold (6×6, three length-2 ships). */
export const BATTLESHIPS_LEVEL_1: BattleshipsLevel = {
  size: 6,
  shipLengths: [2, 2, 2],
};

export type BattleshipsPhase = "setup" | "battle" | "won";

export interface BattleshipsShot {
  cell: number;
  hit: boolean;
  /** Remainder of a sunk ship revealed by the engine — does not consume a turn. */
  auto?: boolean;
}

export interface BattleshipsState {
  size: number;
  shipLengths: number[];
  phase: BattleshipsPhase;
  /** Owner fleet cells; null until placed. */
  ownerShips: number[] | null;
  /** Agent fleet cells; null until placed. */
  agentShips: number[] | null;
  /** Shots fired by owner at the agent board. */
  ownerShots: BattleshipsShot[];
  /** Shots fired by agent at the owner board. */
  agentShots: BattleshipsShot[];
  winner?: GamePlayer;
}

export type BattleshipsMove =
  | { action: "place"; cells: number[] }
  | { action: "fire"; cell: number };

function totalShipCells(lengths: readonly number[]): number {
  return lengths.reduce((sum, length) => sum + length, 0);
}

function areAdjacent(size: number, a: number, b: number): boolean {
  const rowA = Math.floor(a / size);
  const colA = a % size;
  const rowB = Math.floor(b / size);
  const colB = b % size;
  return (rowA === rowB && Math.abs(colA - colB) === 1) || (colA === colB && Math.abs(rowA - rowB) === 1);
}

/** True when `cells` form one straight orthogonal ship of the given length. */
export function isStraightShip(size: number, cells: readonly number[], length: number): boolean {
  if (cells.length !== length) return false;
  const uniq = new Set(cells);
  if (uniq.size !== length) return false;
  const sorted = [...cells].sort((a, b) => a - b);
  const rows = sorted.map((cell) => Math.floor(cell / size));
  const cols = sorted.map((cell) => cell % size);
  const sameRow = rows.every((row) => row === rows[0]);
  const sameCol = cols.every((col) => col === cols[0]);
  if (!sameRow && !sameCol) return false;
  for (let i = 1; i < sorted.length; i++) {
    if (!areAdjacent(size, sorted[i - 1]!, sorted[i]!)) return false;
  }
  return true;
}

/**
 * Partition fleet cells into straight ships matching `lengths`.
 * Returns null when the layout is illegal.
 */
export function partitionFleet(
  size: number,
  cells: readonly number[],
  lengths: readonly number[],
): number[][] | null {
  const need = [...lengths].sort((a, b) => b - a);
  if (cells.length !== totalShipCells(need)) return null;
  const uniq = new Set(cells);
  if (uniq.size !== cells.length) return null;
  const max = size * size;
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= max) return null;
  }

  const remaining = new Set(cells);
  const placed: number[][] = [];

  function candidatesFor(length: number): number[][] {
    const out: number[][] = [];
    for (const start of remaining) {
      for (const horizontal of [true, false]) {
        const ship: number[] = [];
        let ok = true;
        for (let i = 0; i < length; i++) {
          const next = horizontal ? start + i : start + i * size;
          if (horizontal && Math.floor(start / size) !== Math.floor(next / size)) {
            ok = false;
            break;
          }
          if (!remaining.has(next)) {
            ok = false;
            break;
          }
          ship.push(next);
        }
        if (ok && isStraightShip(size, ship, length)) out.push(ship);
      }
    }
    return out;
  }

  function search(needLeft: number[]): boolean {
    if (needLeft.length === 0) return remaining.size === 0;
    const [len, ...rest] = needLeft;
    for (const ship of candidatesFor(len!)) {
      for (const cell of ship) remaining.delete(cell);
      placed.push(ship);
      if (search(rest)) return true;
      placed.pop();
      for (const cell of ship) remaining.add(cell);
    }
    return false;
  }

  return search(need) ? placed.map((ship) => [...ship].sort((a, b) => a - b)) : null;
}

/** Partition cells into straight ships matching `lengths` (order-insensitive). */
export function canPartitionIntoShips(
  size: number,
  cells: readonly number[],
  lengths: readonly number[],
): boolean {
  return partitionFleet(size, cells, lengths) !== null;
}

function shipContaining(
  size: number,
  fleet: readonly number[],
  lengths: readonly number[],
  cell: number,
): number[] | null {
  const ships = partitionFleet(size, fleet, lengths);
  if (!ships) return null;
  return ships.find((ship) => ship.includes(cell)) ?? null;
}

function intentionalShotCount(shots: readonly BattleshipsShot[]): number {
  return shots.filter((shot) => !shot.auto).length;
}

function normalizeShots(raw: unknown): BattleshipsShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: BattleshipsShot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const cell = (entry as { cell?: unknown }).cell;
    const hit = (entry as { hit?: unknown }).hit;
    const auto = (entry as { auto?: unknown }).auto;
    if (typeof cell !== "number" || !Number.isInteger(cell)) continue;
    shots.push({ cell, hit: hit === true, ...(auto === true ? { auto: true } : {}) });
  }
  return shots;
}

function normalizeShipCells(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const cells: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "number" || !Number.isInteger(entry)) return null;
    cells.push(entry);
  }
  return cells;
}

function shotSet(shots: readonly BattleshipsShot[]): Set<number> {
  return new Set(shots.map((shot) => shot.cell));
}

function hitsOnFleet(ships: readonly number[], shots: readonly BattleshipsShot[]): number {
  const fleet = new Set(ships);
  return shots.filter((shot) => shot.hit && fleet.has(shot.cell)).length;
}

function boardView(
  size: number,
  myShips: number[] | null,
  shotsAgainstMe: readonly BattleshipsShot[],
  foeShotsIFired: readonly BattleshipsShot[],
  revealOwnShips: boolean,
): {
  own: Array<"empty" | "ship" | "hit" | "miss">;
  foe: Array<"unknown" | "hit" | "miss">;
} {
  const cells = size * size;
  const ownShips = new Set(myShips ?? []);
  const against = new Map(shotsAgainstMe.map((shot) => [shot.cell, shot.hit] as const));
  const fired = new Map(foeShotsIFired.map((shot) => [shot.cell, shot.hit] as const));

  const own: Array<"empty" | "ship" | "hit" | "miss"> = [];
  const foe: Array<"unknown" | "hit" | "miss"> = [];
  for (let cell = 0; cell < cells; cell++) {
    const hitMe = against.get(cell);
    if (hitMe === true) own.push("hit");
    else if (hitMe === false) own.push("miss");
    else if (revealOwnShips && ownShips.has(cell)) own.push("ship");
    else own.push("empty");

    const hitFoe = fired.get(cell);
    if (hitFoe === true) foe.push("hit");
    else if (hitFoe === false) foe.push("miss");
    else foe.push("unknown");
  }
  return { own, foe };
}

/** Generate one valid placement (used for agent fallback / tests). */
export function randomFleetPlacement(
  size: number,
  shipLengths: readonly number[],
  rng: () => number = Math.random,
): number[] | null {
  const lengths = [...shipLengths].sort((a, b) => b - a);
  const occupied = new Set<number>();
  const placed: number[] = [];

  for (const length of lengths) {
    const candidates: number[][] = [];
    for (let cell = 0; cell < size * size; cell++) {
      for (const horizontal of [true, false]) {
        const ship: number[] = [];
        let ok = true;
        for (let i = 0; i < length; i++) {
          const next = horizontal ? cell + i : cell + i * size;
          if (horizontal && Math.floor(cell / size) !== Math.floor(next / size)) {
            ok = false;
            break;
          }
          if (next < 0 || next >= size * size || occupied.has(next)) {
            ok = false;
            break;
          }
          ship.push(next);
        }
        if (ok) candidates.push(ship);
      }
    }
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    for (const cell of pick) {
      occupied.add(cell);
      placed.push(cell);
    }
  }
  return placed.sort((a, b) => a - b);
}

export class BattleshipsEngine implements GameEngine<BattleshipsState, BattleshipsMove> {
  readonly moduleId = "games/battleships";
  readonly uiEvents = { move: "bsMove", restart: "bsStart" } as const;
  readonly level: BattleshipsLevel;

  constructor(level: BattleshipsLevel = BATTLESHIPS_LEVEL_1) {
    this.level = level;
  }

  initialState(): BattleshipsState {
    return {
      size: this.level.size,
      shipLengths: [...this.level.shipLengths],
      phase: "setup",
      ownerShips: null,
      agentShips: null,
      ownerShots: [],
      agentShots: [],
    };
  }

  parseMove(payload: unknown): BattleshipsMove | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    const action = record.action;

    if (action === "place" || Array.isArray(record.cells)) {
      const cells = normalizeShipCells(record.cells);
      if (!cells) return null;
      return { action: "place", cells };
    }
    if (action === "fire" || typeof record.cell === "number") {
      const cell = record.cell;
      if (typeof cell !== "number" || !Number.isInteger(cell)) return null;
      return { action: "fire", cell };
    }
    return null;
  }

  turn(state: BattleshipsState): GamePlayer {
    if (state.phase === "won") return "owner";
    if (state.phase === "setup") {
      if (!state.ownerShips) return "owner";
      if (!state.agentShips) return "agent";
      return "owner";
    }
    // Battle: only intentional shots consume a turn (auto-reveal after a sink does not).
    return intentionalShotCount(state.ownerShots) === intentionalShotCount(state.agentShots)
      ? "owner"
      : "agent";
  }

  status(state: BattleshipsState): GameStatus {
    if (state.phase === "won" && state.winner) {
      return { phase: "won", winner: state.winner };
    }
    if (state.phase === "setup") return { phase: "active" };
    return { phase: "active" };
  }

  private foeShips(state: BattleshipsState, player: GamePlayer): number[] | null {
    return player === "owner" ? state.agentShips : state.ownerShips;
  }

  private shotsBy(state: BattleshipsState, player: GamePlayer): BattleshipsShot[] {
    return player === "owner" ? state.ownerShots : state.agentShots;
  }

  legalMoves(state: BattleshipsState, player: GamePlayer): BattleshipsMove[] {
    if (this.status(state).phase === "won" || this.turn(state) !== player) return [];

    if (state.phase === "setup") {
      if (player === "owner" && state.ownerShips) return [];
      if (player === "agent" && state.agentShips) return [];
      const sample = randomFleetPlacement(state.size, state.shipLengths);
      return sample ? [{ action: "place", cells: sample }] : [];
    }

    if (state.phase !== "battle") return [];
    const fired = shotSet(this.shotsBy(state, player));
    const moves: BattleshipsMove[] = [];
    for (let cell = 0; cell < state.size * state.size; cell++) {
      if (!fired.has(cell)) moves.push({ action: "fire", cell });
    }
    return moves;
  }

  applyMove(
    state: BattleshipsState,
    move: BattleshipsMove,
    player: GamePlayer,
  ): GameMoveResult<BattleshipsState> {
    if (state.phase === "won") {
      return { ok: false, reason: "the game is already over" };
    }
    if (this.turn(state) !== player) {
      return { ok: false, reason: `it is not ${player}'s turn` };
    }

    if (state.phase === "setup") {
      if (move.action !== "place") {
        return { ok: false, reason: "place your ships before firing" };
      }
      if (player === "owner" && state.ownerShips) {
        return { ok: false, reason: "owner ships are already placed" };
      }
      if (player === "agent" && state.agentShips) {
        return { ok: false, reason: "agent ships are already placed" };
      }
      if (!canPartitionIntoShips(state.size, move.cells, state.shipLengths)) {
        return {
          ok: false,
          reason: `place contiguous ships matching lengths ${state.shipLengths.join(",")}`,
        };
      }
      const sorted = [...move.cells].sort((a, b) => a - b);
      const next: BattleshipsState = {
        ...state,
        ownerShips: player === "owner" ? sorted : state.ownerShips,
        agentShips: player === "agent" ? sorted : state.agentShips,
        ownerShots: [...state.ownerShots],
        agentShots: [...state.agentShots],
      };
      if (next.ownerShips && next.agentShips) {
        next.phase = "battle";
      }
      return { ok: true, state: next };
    }

    // battle
    if (move.action !== "fire") {
      return { ok: false, reason: "ships are locked — fire at the opponent board" };
    }
    const max = state.size * state.size;
    if (move.cell < 0 || move.cell >= max) {
      return { ok: false, reason: `cell ${move.cell} is out of range` };
    }
    const myShots = this.shotsBy(state, player);
    if (myShots.some((shot) => shot.cell === move.cell)) {
      return { ok: false, reason: `cell ${move.cell} was already fired` };
    }
    const foe = this.foeShips(state, player);
    if (!foe) return { ok: false, reason: "opponent fleet is not placed" };
    const hit = foe.includes(move.cell);
    const added: BattleshipsShot[] = [{ cell: move.cell, hit }];
    if (hit) {
      const ship = shipContaining(state.size, foe, state.shipLengths, move.cell);
      if (ship) {
        for (const cell of ship) {
          if (cell === move.cell) continue;
          if (myShots.some((shot) => shot.cell === cell) || added.some((shot) => shot.cell === cell)) {
            continue;
          }
          added.push({ cell, hit: true, auto: true });
        }
      }
    }

    const next: BattleshipsState = {
      ...state,
      ownerShots: player === "owner" ? [...state.ownerShots, ...added] : [...state.ownerShots],
      agentShots: player === "agent" ? [...state.agentShots, ...added] : [...state.agentShots],
      ownerShips: state.ownerShips ? [...state.ownerShips] : null,
      agentShips: state.agentShips ? [...state.agentShips] : null,
      shipLengths: [...state.shipLengths],
    };

    const shotsNow = player === "owner" ? next.ownerShots : next.agentShots;
    if (hitsOnFleet(foe, shotsNow) >= foe.length) {
      next.phase = "won";
      next.winner = player;
    }
    return { ok: true, state: next };
  }

  toProps(state: BattleshipsState): JsonObject {
    const status = this.status(state);
    const view = boardView(
      state.size,
      state.ownerShips,
      state.agentShots,
      state.ownerShots,
      true,
    );
    const total = totalShipCells(state.shipLengths);
    const agentHits = state.agentShips ? hitsOnFleet(state.agentShips, state.ownerShots) : 0;
    return {
      gameId: "bs-shell",
      phase: state.phase,
      size: state.size,
      shipLengths: [...state.shipLengths],
      totalShipCells: total,
      turn: this.turn(state),
      status: status.phase === "won" ? "won" : "active",
      winner: status.winner ?? null,
      ownerPlaced: state.ownerShips !== null,
      agentPlaced: state.agentShips !== null,
      ownBoard: view.own,
      foeBoard: view.foe,
      foeHitsFound: agentHits,
      foeShipCells: state.agentShips?.length ?? total,
      // Host recovery — not for module rendering.
      _state: state as unknown as JsonObject,
    };
  }

  /** Filtered boards for A2A seating (A = owner seat, B = agent seat). */
  toSeatBoardView(
    state: BattleshipsState,
    seat: "A" | "B",
  ): { own: Array<"empty" | "ship" | "hit" | "miss">; foe: Array<"unknown" | "hit" | "miss"> } {
    const myShips = seat === "A" ? state.ownerShips : state.agentShips;
    const shotsAgainstMe = seat === "A" ? state.agentShots : state.ownerShots;
    const shotsIFired = seat === "A" ? state.ownerShots : state.agentShots;
    return boardView(state.size, myShips, shotsAgainstMe, shotsIFired, true);
  }

  fromProps(props: JsonObject): BattleshipsState {
    const raw = props._state;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      const size =
        typeof record.size === "number" && Number.isInteger(record.size)
          ? record.size
          : this.level.size;
      const shipLengths = Array.isArray(record.shipLengths)
        ? record.shipLengths.filter((n): n is number => typeof n === "number")
        : [...this.level.shipLengths];
      const phase =
        record.phase === "battle" || record.phase === "won" || record.phase === "setup"
          ? record.phase
          : "setup";
      const winner =
        record.winner === "owner" || record.winner === "agent" ? record.winner : undefined;
      return {
        size,
        shipLengths,
        phase,
        ownerShips: normalizeShipCells(record.ownerShips),
        agentShips: normalizeShipCells(record.agentShips),
        ownerShots: normalizeShots(record.ownerShots),
        agentShots: normalizeShots(record.agentShots),
        winner,
      };
    }
    return this.initialState();
  }

  agentView(state: BattleshipsState): JsonObject {
    const status = this.status(state);
    const turn = this.turn(state);
    const viewBoards = boardView(
      state.size,
      state.agentShips,
      state.ownerShots,
      state.agentShots,
      true,
    );
    const legal = this.legalMoves(state, "agent");
    const base: JsonObject = {
      game: "battleships",
      phase: state.phase,
      size: state.size,
      shipLengths: [...state.shipLengths],
      totalShipCells: totalShipCells(state.shipLengths),
      turn,
      status: status.phase,
      winner: status.winner ?? null,
      yourShips: state.agentShips ? [...state.agentShips] : null,
      ownBoard: viewBoards.own,
      foeBoard: viewBoards.foe,
      foeHitsFound: state.ownerShips ? hitsOnFleet(state.ownerShips, state.agentShots) : 0,
      foeShipCells: state.ownerShips?.length ?? totalShipCells(state.shipLengths),
    };

    if (state.phase === "setup" && turn === "agent") {
      base.action = "place";
      base.moveShape = { action: "place", cells: "<contiguous cells matching shipLengths>" };
      const sample = legal.find((move) => move.action === "place");
      if (sample && sample.action === "place") base.samplePlace = sample.cells;
    } else if (state.phase === "battle" && turn === "agent") {
      base.action = "fire";
      const fireMoves = legal.filter(
        (move): move is { action: "fire"; cell: number } => move.action === "fire",
      );
      base.moveShape = { action: "fire", cell: "<one of legalCells>" };
      if (fireMoves.length > 0) {
        const scores = this.rankMoves(state, "agent", fireMoves);
        const moveScores: JsonObject = {};
        const ranked: Array<{ cell: number; score: number }> = [];
        for (let index = 0; index < fireMoves.length; index++) {
          const cell = fireMoves[index]!.cell;
          const score = scores[index]!;
          moveScores[String(cell)] = score;
          ranked.push({ cell, score });
        }
        ranked.sort((a, b) => b.score - a.score || a.cell - b.cell);
        // Lead legalCells with preferred targets so naive "first cell" picks are not raster.
        base.legalCells = ranked.map((row) => row.cell);
        base.moveScores = moveScores;
        base.preferredCells = ranked.slice(0, Math.min(6, ranked.length)).map((row) => row.cell);
        base.strategy =
          "Prefer preferredCells (parity scatter, scrambled — never scan row/column in order from cell 0).";
      }
    }
    return base;
  }

  /**
   * Higher = stronger. With sink-on-first-hit there are no partial ships to
   * chase, so scores are a parity checkerboard scrambled by salt (shot history)
   * — never cell index order from top-left.
   */
  rankMoves(state: BattleshipsState, player: GamePlayer, moves: BattleshipsMove[]): number[] {
    if (state.phase === "setup") {
      return moves.map(() => Math.random());
    }
    const myShots = this.shotsBy(state, player);
    const hitSum = myShots.filter((shot) => shot.hit).reduce((sum, shot) => sum + shot.cell, 0);
    const salt = (hitSum + myShots.length * 17 + 41) % 97;

    return moves.map((move) => {
      if (move.action !== "fire") return Math.random();
      const parity = (Math.floor(move.cell / state.size) + (move.cell % state.size)) % 2;
      const preferredParity = salt % 2;
      const parityScore = parity === preferredParity ? 20 : 6;
      // Deterministic scramble so fallback / preferredCells aren't raster order.
      const scramble = (move.cell * 13 + salt * 7) % 19;
      const jitter = Math.random() * 0.5;
      return parityScore + scramble + jitter;
    });
  }
}
