import type { BattleshipsMove, BattleshipsState } from "@qwixl/shell-core";
import { BattleshipsA2AHost, type BattleshipsPublicState } from "@qwixl/shell-core";
import type { BsPlayer, CommsThreadItem } from "./types.js";
import { latestBsState, myPlayerFromThread } from "./bsLogic.js";

const HOST_STATE_KEY = "atom-bs-host-state:";

export function saveBsHostEngineState(gameId: string, state: BattleshipsState): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(HOST_STATE_KEY + gameId, JSON.stringify(state));
}

export function loadBsHostEngineState(gameId: string): BattleshipsState | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(HOST_STATE_KEY + gameId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BattleshipsState;
  } catch {
    return null;
  }
}

export function getOrCreateBsHost(gameId: string): BattleshipsA2AHost {
  const saved = loadBsHostEngineState(gameId);
  if (saved) return new BattleshipsA2AHost(undefined, saved);
  const host = BattleshipsA2AHost.create();
  saveBsHostEngineState(gameId, host.state);
  return host;
}

export function persistBsHost(gameId: string, host: BattleshipsA2AHost): void {
  saveBsHostEngineState(gameId, host.state);
}

export function isEngineBsState(
  state: { publicState?: BattleshipsPublicState } | undefined,
): state is { publicState: BattleshipsPublicState } {
  return Boolean(state?.publicState?.engine);
}

export function modulePropsFromEngineState(
  gameId: string,
  publicState: BattleshipsPublicState,
  mySeat: BsPlayer,
) {
  const board = publicState.boards[mySeat];
  const myPlaced = mySeat === "A" ? publicState.ownPlacedA : publicState.ownPlacedB;
  const foePlaced = mySeat === "A" ? publicState.ownPlacedB : publicState.ownPlacedA;
  const myTurn = publicState.turn === mySeat;
  const totalShipCells = publicState.shipLengths.reduce((sum, length) => sum + length, 0);
  const foeHitsFound = board.foe.filter((cell) => cell === "hit").length;
  return {
    gameId,
    size: publicState.size,
    shipLengths: publicState.shipLengths,
    totalShipCells,
    phase: publicState.phase,
    status: publicState.status,
    turn: myTurn ? "owner" : "agent",
    winner:
      publicState.winner === mySeat
        ? "owner"
        : publicState.winner
          ? "agent"
          : null,
    ownerPlaced: myPlaced,
    agentPlaced: foePlaced,
    ownBoard: board.own,
    foeBoard: board.foe,
    foeHitsFound,
    foeShipCells: totalShipCells,
  };
}

export function latestEngineBsState(
  gameId: string,
  thread: CommsThreadItem[],
): { state: Extract<CommsThreadItem, { kind: "bs-state" }>; publicState: BattleshipsPublicState } | null {
  const state = latestBsState(gameId, thread);
  if (!state?.publicState?.engine) return null;
  return { state, publicState: state.publicState };
}

export function parseBsMoveFromThreadItem(
  item: Extract<CommsThreadItem, { kind: "bs-move" }>,
): BattleshipsMove | null {
  if (item.action === "place" && item.cells?.length) {
    return { action: "place", cells: item.cells };
  }
  if (item.action === "fire" && typeof item.cell === "number") {
    return { action: "fire", cell: item.cell };
  }
  return null;
}

export function mySeatFromThread(gameId: string, thread: CommsThreadItem[]): BsPlayer {
  return myPlayerFromThread(gameId, thread);
}
