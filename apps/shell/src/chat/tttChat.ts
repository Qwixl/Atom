import type { Catalog, Composition, ConversationRuntime, FeedItem, ModuleRegistry } from "@qwixl/shell-core";
import { applyTttMove, emptyTttBoard, pickBotMove } from "../comms/tttLogic.js";
import type { TttBoard } from "../comms/types.js";

const TTT_COMPONENT = "games/tictactoe";

const TTT_INTENT =
  /\b(tic[\s-]?tac[\s-]?toe|tictactoe)\b/i;

export function looksLikeTttIntent(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (TTT_INTENT.test(lower)) return true;
  if (/new game.*(tic|toe|tictactoe)/.test(lower)) return true;
  if (/(play|start|try).*(tic|tictactoe|tic-tac-toe)/.test(lower)) return true;
  return false;
}

const TTT_RETRY =
  /\b(try again|retry|render|didn't render|did not render|not render|show (the )?board|fix the board|board again)\b/i;

/** User asked to retry after a broken or missing board in an ongoing tic-tac-toe chat. */
export function looksLikeTttRetry(text: string, feed: readonly FeedItem[]): boolean {
  if (!TTT_RETRY.test(text.trim())) return false;
  const window = feed.slice(-12);
  return window.some((item) => {
    if (item.kind === "user" && looksLikeTttIntent(item.text)) return true;
    if (item.kind === "agent-text" && /\btic[\s-]?tac[\s-]?toe\b/i.test(item.text)) return true;
    if (item.kind === "surface" && feedSurfaceHasTtt(item.surface)) return true;
    return false;
  });
}

function feedSurfaceHasTtt(surface: import("@qwixl/shell-core").ResolvedSurface): boolean {
  const walk = (node: import("@qwixl/shell-core").ResolvedNode): boolean => {
    if (node.node.component === TTT_COMPONENT) return true;
    return node.children.some(walk);
  };
  return walk(surface.root);
}

export function shouldOpenChatTtt(text: string, feed: readonly FeedItem[]): boolean {
  return looksLikeTttIntent(text) || looksLikeTttRetry(text, feed);
}

interface ChatTttState {
  board: TttBoard;
  status: "active" | "won" | "draw";
  turn: "X" | "O";
  winner?: "X" | "O";
  userMark: "X" | "O";
}

const chatTttBySurface = new Map<string, ChatTttState>();

function formatCellLabel(cell: number): string {
  return String(cell + 1);
}

function statusText(state: ChatTttState): string | null {
  if (state.status === "won") {
    return state.winner === state.userMark ? "You win!" : "I win — good game.";
  }
  if (state.status === "draw") return "Draw.";
  return null;
}

function buildChatTttComposition(surfaceId: string): Composition {
  return {
    version: 1,
    surfaceId,
    intent: "Play tic-tac-toe",
    root: {
      id: "game",
      component: TTT_COMPONENT,
      semanticRole: "input/game-board",
      events: ["tttStart", "tttMove"],
      props: {
        board: emptyTttBoard(),
        turn: "X",
        status: "active",
        myMark: "X",
        readOnly: false,
      },
    },
  };
}

function initialChatState(): ChatTttState {
  return {
    board: emptyTttBoard(),
    status: "active",
    turn: "X",
    userMark: "X",
  };
}

function pushSurfaceProps(runtime: ConversationRuntime, surfaceId: string, state: ChatTttState): void {
  runtime.updateSurfaceModuleProps(surfaceId, TTT_COMPONENT, {
    board: state.board,
    turn: state.turn,
    status: state.status,
    winner: state.winner ?? null,
    myMark: state.userMark,
    readOnly: state.status !== "active" || state.turn !== state.userMark,
  });
}

/** Shell-owned board — do not rely on the LLM to compose the module. */
export async function openChatTttBoard(opts: {
  runtime: ConversationRuntime;
  catalog: Catalog;
  registry: ModuleRegistry;
}): Promise<void> {
  const surfaceId = `ttt-chat-${Date.now()}`;
  const composition = buildChatTttComposition(surfaceId);
  if (!opts.catalog.lookup(TTT_COMPONENT)) {
    try {
      await opts.registry.ensureModules(opts.catalog, composition);
    } catch (error) {
      opts.runtime.appendLocalAgentText(
        error instanceof Error ? error.message : "Could not load tic-tac-toe module.",
      );
      opts.runtime.setBusy(false);
      return;
    }
  }
  chatTttBySurface.set(surfaceId, initialChatState());
  await opts.runtime.showComposition(composition);
  opts.runtime.appendLocalAgentText("You're X — tap a square to play.");
  opts.runtime.setBusy(false);
}

function startChatGame(surfaceId: string, runtime: ConversationRuntime): void {
  chatTttBySurface.set(surfaceId, initialChatState());
  pushSurfaceProps(runtime, surfaceId, chatTttBySurface.get(surfaceId)!);
  runtime.appendLocalAgentText("New game — you're X. Tap a square to play.");
}

function applyUserMove(surfaceId: string, cell: number, runtime: ConversationRuntime): boolean {
  const state = chatTttBySurface.get(surfaceId);
  if (!state || state.status !== "active" || state.turn !== state.userMark) return false;
  if (cell < 0 || cell > 8 || state.board[cell]) return false;

  let next = applyTttMove(state.board, cell, state.userMark);
  state.board = next.board;
  state.status = next.status;
  state.turn = next.turn;
  state.winner = next.winner;

  runtime.appendLocalAgentText(`You played ${formatCellLabel(cell)}.`);

  if (state.status === "active" && state.turn !== state.userMark) {
    const botCell = pickBotMove(state.board, "O");
    if (botCell != null) {
      next = applyTttMove(state.board, botCell, "O");
      state.board = next.board;
      state.status = next.status;
      state.turn = next.turn;
      state.winner = next.winner;
      runtime.appendLocalAgentText(`I played ${formatCellLabel(botCell)}.`);
    }
  }

  chatTttBySurface.set(surfaceId, state);
  pushSurfaceProps(runtime, surfaceId, state);

  const end = statusText(state);
  if (end) runtime.appendLocalAgentText(end);
  return true;
}

/** Client-side tic-tac-toe in Chat — avoids LLM board corruption. Returns true if handled. */
export function handleChatTttUiEvent(
  event: import("@qwixl/shell-core").UiEvent,
  runtime: ConversationRuntime,
): boolean {
  if (event.name !== "tttMove" && event.name !== "tttStart") return false;

  if (event.name === "tttStart") {
    startChatGame(event.surfaceId, runtime);
    return true;
  }

  const payload = event.payload;
  const cell =
    payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.cell === "number"
      ? payload.cell
      : null;
  if (cell == null) return false;

  let state = chatTttBySurface.get(event.surfaceId);
  if (!state) {
    state = initialChatState();
    chatTttBySurface.set(event.surfaceId, state);
    pushSurfaceProps(runtime, event.surfaceId, state);
  }

  return applyUserMove(event.surfaceId, cell, runtime);
}
