import type { JsonObject, JsonValue } from "../types.js";

/**
 * Gaming Framework core contract.
 *
 * Pattern (same as online chess servers, e.g. lichess): the shell owns
 * authoritative game state and enforces the rules; players — the owner via
 * module UI, the agent via `game-move` protocol messages — only PROPOSE
 * moves. The engine validates and applies them. An agent can be a weak
 * player, but it can never cheat: illegal moves are rejected, and it never
 * writes board state directly.
 */

/** The two seats every 1v1 shell game has. Owner interacts via module UI. */
export type GamePlayer = "owner" | "agent";

export interface GameStatus {
  phase: "active" | "won" | "draw";
  winner?: GamePlayer;
  /** Engine-defined cell indices forming the winning sequence (for UI strike-through). */
  winningLine?: number[];
}

export type GameMoveResult<State> =
  | { ok: true; state: State }
  | { ok: false; reason: string };

export interface GameEngine<State = unknown, Move = JsonValue> {
  /** Module component id this engine arbitrates, e.g. "games/tictactoe". */
  readonly moduleId: string;
  /** Module ui-event names for owner moves (orchestrator wiring). */
  readonly uiEvents?: { move: string; restart?: string };
  initialState(): State;
  /** Parse an untrusted move payload (module event or agent message). Null = malformed. */
  parseMove(payload: unknown): Move | null;
  /** Whose turn it is. Meaningless once status.phase !== "active". */
  turn(state: State): GamePlayer;
  status(state: State): GameStatus;
  legalMoves(state: State, player: GamePlayer): Move[];
  /** Validate + apply. Never mutates input; illegal moves return a reason. */
  applyMove(state: State, move: Move, player: GamePlayer): GameMoveResult<State>;
  /** Project state into module props for rendering. */
  toProps(state: State): JsonObject;
  /** Recover state from module props (feed persistence); sanitizes garbage. */
  fromProps(props: JsonObject): State;
  /** Compact summary sent to the agent each turn (state + legal moves). */
  agentView(state: State): JsonObject;
  /**
   * Optional move ranking for difficulty hints (same order as `legalMoves`;
   * higher = stronger). When omitted the agent picks from `legalMoves` alone.
   */
  rankMoves?(state: State, player: GamePlayer, moves: Move[]): number[];
}
