import type { JsonObject } from "../types.js";
import type { GameEngine } from "./engine.js";
import type { ActiveChatGame } from "./feed.js";
import { getGameEngine } from "./registry.js";

export const GAME_MOVE_FALLBACK_TEXT =
  "(Your agent didn't produce a valid move, so the shell played a random legal move for it.)";

export interface GameOrchestratorCallbacks {
  getActiveGame(): ActiveChatGame | null;
  commitProps(surfaceId: string, moduleId: string, props: JsonObject): void;
  appendAgentText(text: string): void;
  requestAgentTurn(prompt: string): void;
}

export interface OwnerUiEventResult {
  handled: boolean;
  /** When true the host should clear game-modal dismissal (e.g. Play again). */
  reopenModal?: boolean;
}

/** Shell-side turn loop: owner moves, agent game-move, retry, disclosed fallback. */
export class GameOrchestrator {
  private retryCount = 0;
  private lastReject: string | null = null;

  resetTurnState(): void {
    this.retryCount = 0;
    this.lastReject = null;
  }

  buildGameTurnPrompt(engine: GameEngine, surfaceId: string, state: unknown, rejectionReason?: string | null): string {
    const view = engine.agentView(state);
    const prefix = rejectionReason
      ? `Your previous move was rejected by the game engine: ${rejectionReason}. `
      : "";
    const moveHint =
      typeof view.moveShape === "object" && view.moveShape !== null
        ? `Reply with ONLY: {"messages":[{"type":"game-move","surfaceId":"${surfaceId}","move":${JSON.stringify(view.moveShape)}}]} — replace placeholders; no text, no composition.`
        : `Reply with ONLY: {"messages":[{"type":"game-move","surfaceId":"${surfaceId}","move":{"cell":<one of legalCells>}}]} — no text, no composition.`;
    return `[game-turn] ${prefix}It is your move. Game state: ${JSON.stringify(view)}. ${moveHint}`;
  }

  /** Agent proposed a move via the game-move protocol message. */
  handleAgentMove(surfaceId: string, movePayload: unknown, callbacks: GameOrchestratorCallbacks): void {
    const game = callbacks.getActiveGame();
    if (!game || game.surface.surfaceId !== surfaceId) {
      this.lastReject = "that surfaceId is not the active game";
      return;
    }
    const engine = getGameEngine(game.embed.moduleId);
    if (!engine) return;
    const state = engine.fromProps(game.embed.props);
    const move = engine.parseMove(movePayload);
    if (!move) {
      this.lastReject = "the move payload was malformed";
      return;
    }
    const result = engine.applyMove(state, move, "agent");
    if (!result.ok) {
      this.lastReject = result.reason;
      return;
    }
    this.retryCount = 0;
    this.lastReject = null;
    callbacks.commitProps(game.surface.surfaceId, engine.moduleId, engine.toProps(result.state));
  }

  /** Owner module ui-event for an active shell-arbitrated game. */
  handleOwnerUiEvent(
    eventName: string,
    payload: unknown,
    game: ActiveChatGame,
    props: JsonObject,
    callbacks: GameOrchestratorCallbacks,
  ): OwnerUiEventResult {
    const engine = getGameEngine(game.embed.moduleId);
    if (!engine?.uiEvents) return { handled: false };

    const surfaceId = game.surface.surfaceId;
    const state = engine.fromProps(props);

    if (engine.uiEvents.restart && eventName === engine.uiEvents.restart) {
      this.resetTurnState();
      callbacks.commitProps(surfaceId, engine.moduleId, engine.toProps(engine.initialState()));
      return { handled: true, reopenModal: true };
    }

    if (eventName !== engine.uiEvents.move) return { handled: false };

    const move = engine.parseMove(payload);
    if (!move) return { handled: true };
    const result = engine.applyMove(state, move, "owner");
    if (!result.ok) return { handled: true };

    this.resetTurnState();
    callbacks.commitProps(surfaceId, engine.moduleId, engine.toProps(result.state));
    const status = engine.status(result.state);
    if (status.phase === "active" && engine.turn(result.state) === "agent") {
      callbacks.requestAgentTurn(this.buildGameTurnPrompt(engine, surfaceId, result.state));
    }
    return { handled: true };
  }

  /**
   * End-of-turn arbiter: if the agent owes a move, retry once with the
   * rejection reason and legal moves; after that, play a disclosed fallback
   * so the game can never stall. Returns true when a retry turn was started.
   */
  ensureAgentMove(callbacks: GameOrchestratorCallbacks): boolean {
    const game = callbacks.getActiveGame();
    if (!game) {
      this.resetTurnState();
      return false;
    }
    const engine = getGameEngine(game.embed.moduleId);
    if (!engine) return false;
    const state = engine.fromProps(game.embed.props);
    if (engine.status(state).phase !== "active" || engine.turn(state) !== "agent") {
      this.resetTurnState();
      return false;
    }
    const surfaceId = game.surface.surfaceId;
    if (this.retryCount < 1) {
      this.retryCount += 1;
      const reason = this.lastReject;
      this.lastReject = null;
      callbacks.requestAgentTurn(this.buildGameTurnPrompt(engine, surfaceId, state, reason));
      return true;
    }
    const legal = engine.legalMoves(state, "agent");
    let fallback = legal[0];
    if (engine.rankMoves && legal.length > 0) {
      const scores = engine.rankMoves(state, "agent", legal);
      const ranked = legal
        .map((move, index) => ({ move, score: scores[index]! }))
        .sort((a, b) => b.score - a.score);
      const topScore = ranked[0]!.score;
      const pool = ranked.filter((row) => row.score >= topScore - 1).map((row) => row.move);
      fallback = pool[Math.floor(Math.random() * pool.length)] ?? ranked[0]!.move;
    } else if (legal.length > 0) {
      fallback = legal[Math.floor(Math.random() * legal.length)];
    }
    if (fallback !== undefined) {
      const result = engine.applyMove(state, fallback, "agent");
      if (result.ok) {
        callbacks.commitProps(surfaceId, engine.moduleId, engine.toProps(result.state));
        callbacks.appendAgentText(GAME_MOVE_FALLBACK_TEXT);
      }
    }
    this.resetTurnState();
    return false;
  }
}
