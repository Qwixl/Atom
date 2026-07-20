/**
 * Swarm NPC auto-play for Comms A2A tic-tac-toe (user↔NPC and NPC↔NPC).
 */

import {
  createTttMove,
  createTttState,
  GAME_TTT_STATE_PURPOSE,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import type { AgentKindConfig } from "./config.js";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import {
  applySwarmTttMove,
  normalizeSwarmTttBoard,
  pickSwarmTttBotMove,
} from "./swarmTttLogic.js";

export interface SwarmGameReplyDeps {
  agentKind: AgentKindConfig;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
}

function peerUrlFor(peerRecords: MlsPeerRecordStore, peerDid: string): string | undefined {
  return peerRecords.list().find((p) => p.peerDid === peerDid)?.peerUrl?.trim() || undefined;
}

/**
 * If inbound is an active TTT state and it is this NPC's turn, play a legal move and publish state.
 */
export async function maybePlaySwarmTtt(
  deps: SwarmGameReplyDeps,
  object: DataObject,
): Promise<{ played: boolean; reason?: string }> {
  if (deps.agentKind !== "swarm-npc") {
    return { played: false, reason: "not_swarm_npc" };
  }
  if (object.governance.purpose !== GAME_TTT_STATE_PURPOSE) {
    return { played: false, reason: "not_ttt_state" };
  }
  if (object.issuerDid === deps.identity.did) {
    return { played: false, reason: "own_state" };
  }
  const peerDid = object.issuerDid?.trim();
  if (!peerDid) return { played: false, reason: "no_peer" };
  const peerUrl = peerUrlFor(deps.peerRecords, peerDid);
  if (!peerUrl) return { played: false, reason: "no_peer_url" };
  if (!deps.mlsStore.hasSession(peerDid)) {
    return { played: false, reason: "no_mls_session" };
  }

  const p = object.payload as Record<string, unknown>;
  const gameId = typeof p.gameId === "string" ? p.gameId.trim() : "";
  const status = p.status === "won" || p.status === "draw" ? p.status : "active";
  const turn: "X" | "O" = p.turn === "O" ? "O" : "X";
  if (!gameId) return { played: false, reason: "no_game_id" };
  if (status !== "active") return { played: false, reason: "game_over" };

  const board = normalizeSwarmTttBoard(p.board);
  // Empty board + X to move: human (or peer) is the opener — do not steal seat X.
  const marks = board.filter((c) => c === "X" || c === "O").length;
  if (turn === "X" && marks === 0) {
    return { played: false, reason: "waiting_for_opener" };
  }
  const seat = turn;
  const cell = pickSwarmTttBotMove(board, seat);
  if (cell == null) return { played: false, reason: "no_legal_move" };

  let next: ReturnType<typeof applySwarmTttMove>;
  try {
    next = applySwarmTttMove(board, cell, seat);
  } catch (error) {
    return {
      played: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const move = await createTttMove({
    identity: deps.identity,
    payload: { gameId, cell, mark: seat },
  });
  const state = await createTttState({
    identity: deps.identity,
    payload: {
      gameId,
      board: next.board,
      turn: next.turn,
      status: next.status,
      winner: next.winner,
    },
  });

  await deliverSignedObject({
    mlsStore: deps.mlsStore,
    peerUrl,
    peerDid,
    object: move,
    encrypt: true,
  });
  await deliverSignedObject({
    mlsStore: deps.mlsStore,
    peerUrl,
    peerDid,
    object: state,
    encrypt: true,
  });
  console.log(`[swarm-game] ttt move cell=${cell} as ${seat} vs ${peerDid} game=${gameId}`);
  return { played: true };
}
