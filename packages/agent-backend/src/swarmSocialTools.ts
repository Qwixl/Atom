/**
 * Swarm NPC social tools: invite friends to rooms + challenge to games (D090).
 */

import { createRoomInvite, createTttState } from "@qwixl/a2a-transport";
import type { AgentKeyPair } from "@qwixl/protocol";
import { COFFEE_SHOP_ROOM_ID } from "./communityCoffeeShop.js";
import { deliverSignedObject } from "./deliverObject.js";
import { connectMlsPeer } from "./mlsReconnect.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { RoomStore } from "./roomStore.js";
import {
  findSwarmCommunityMember,
  resolveCommunityMemberPublicUrl,
} from "./swarmCommunity.js";
import {
  SWARM_CHALLENGE_GAME_TOOL,
  SWARM_INVITE_FRIEND_TOOL,
} from "./swarmToolBudget.js";
import { emptySwarmTttBoard, pickSwarmTttBotMove, applySwarmTttMove } from "./swarmTttLogic.js";

export { SWARM_CHALLENGE_GAME_TOOL, SWARM_INVITE_FRIEND_TOOL };

export const SWARM_SOCIAL_TOOL_NAMES = [
  SWARM_INVITE_FRIEND_TOOL,
  SWARM_CHALLENGE_GAME_TOOL,
] as const;

export interface SwarmSocialDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  rooms: RoomStore;
  publicBaseUrl: string;
  /** Optional display name for invites. */
  selfDisplayName?: string;
}

export const INVITE_FRIEND_CHAT_TOOL = {
  type: "function" as const,
  function: {
    name: SWARM_INVITE_FRIEND_TOOL,
    description:
      "Invite a named community friend into an open room (Coffee Shop by default, or a new hangout you host). " +
      "Use when the human wants to meet your friend in a shared place — never pull them into a private 1:1 DM. " +
      "Friend must be someone from your community roster (e.g. Jonah, Rex, Lena).",
    parameters: {
      type: "object",
      properties: {
        friend: {
          type: "string",
          description: "Friend's name, handle, or seed id (e.g. Jonah, @jonah, jonah-pastor).",
        },
        roomName: {
          type: "string",
          description: "Optional new room name. Omit to use the Coffee Shop.",
        },
        note: {
          type: "string",
          description: "Optional short note on the invite.",
        },
      },
      required: ["friend"],
      additionalProperties: false,
    },
  },
};

export const CHALLENGE_GAME_CHAT_TOOL = {
  type: "function" as const,
  function: {
    name: SWARM_CHALLENGE_GAME_TOOL,
    description:
      "Start a tic-tac-toe game with a Messages contact or community friend. " +
      "You play as X and make the opening move. Works for human peers and other NPCs. " +
      "Only tic-tac-toe is available today (not a free choice among many games). " +
      "After calling this tool, reply in one short sentence — do NOT draw ASCII boards " +
      "or ask them to type cell numbers; the shell opens a game window for moves.",
    parameters: {
      type: "object",
      properties: {
        opponent: {
          type: "string",
          description:
            "Opponent name/handle, or 'this' / 'peer' to challenge the current DM peer.",
        },
        game: {
          type: "string",
          enum: ["tictactoe"],
          description: "Game type. Only tictactoe is implemented.",
        },
      },
      required: ["opponent"],
      additionalProperties: false,
    },
  },
};

function peerUrlFor(peerRecords: MlsPeerRecordStore, peerDid: string): string | undefined {
  return peerRecords.list().find((p) => p.peerDid === peerDid)?.peerUrl?.trim() || undefined;
}

async function resolveOpponentEndpoint(
  deps: SwarmSocialDeps,
  opponentRaw: string,
  fallbackPeerDid?: string,
): Promise<{ peerDid: string; peerUrl: string; label: string } | { error: string }> {
  const q = opponentRaw.trim().toLowerCase();
  if (!q) return { error: "opponent is required" };

  if (
    (q === "this" || q === "peer" || q === "them" || q === "you") &&
    fallbackPeerDid
  ) {
    const peerUrl = peerUrlFor(deps.peerRecords, fallbackPeerDid);
    if (!peerUrl) return { error: "no peer URL for current DM contact" };
    return { peerDid: fallbackPeerDid, peerUrl, label: "this peer" };
  }

  // Trusted peer by substring of DID or remembered URL path — prefer community roster.
  const member = findSwarmCommunityMember(opponentRaw);
  if (member) {
    const publicUrl = resolveCommunityMemberPublicUrl(member);
    if (!publicUrl) return { error: `cannot resolve public URL for ${member.displayName}` };
    const peerUrl = `${publicUrl}/a2a/jsonrpc`;
    // Ensure we know their DID via health if not already paired.
    let peerDid =
      deps.peerRecords.list().find((p) => p.peerUrl?.includes(String(member.portHint)))?.peerDid;
    if (!peerDid) {
      try {
        const health = (await fetch(`${publicUrl}/health`).then((r) => r.json())) as {
          did?: string;
        };
        if (!health.did) return { error: `${member.displayName} health missing did` };
        peerDid = health.did;
        deps.peerRecords.remember(peerDid, peerUrl);
      } catch (error) {
        return {
          error: `could not reach ${member.displayName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }
    if (!deps.mlsStore.hasSession(peerDid)) {
      try {
        await connectMlsPeer({
          mlsStore: deps.mlsStore,
          peerRecords: deps.peerRecords,
          localDid: deps.identity.did,
          peerDid,
          peerUrl,
          initiatorEndpoint: `${deps.publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
        });
      } catch (error) {
        return {
          error: `MLS connect to ${member.displayName} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }
    return { peerDid, peerUrl, label: member.displayName };
  }

  if (fallbackPeerDid) {
    const peerUrl = peerUrlFor(deps.peerRecords, fallbackPeerDid);
    if (peerUrl) {
      return { peerDid: fallbackPeerDid, peerUrl, label: opponentRaw.trim() };
    }
  }
  return { error: `unknown friend or opponent "${opponentRaw}"` };
}

export async function executeInviteFriendToRoom(
  deps: SwarmSocialDeps,
  argsJson: string,
): Promise<string> {
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson);
  } catch {
    return JSON.stringify({ error: "invalid JSON arguments" });
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const friend = typeof obj.friend === "string" ? obj.friend.trim() : "";
  const roomName =
    typeof obj.roomName === "string" && obj.roomName.trim() ? obj.roomName.trim() : null;
  const note = typeof obj.note === "string" ? obj.note.trim() : undefined;
  if (!friend) return JSON.stringify({ error: "friend is required" });

  const member = findSwarmCommunityMember(friend);
  if (!member) {
    return JSON.stringify({
      error: `unknown community friend "${friend}" — use a name from your roster`,
    });
  }
  const resolved = await resolveOpponentEndpoint(deps, friend);
  if ("error" in resolved) return JSON.stringify(resolved);

  let roomId: string;
  let hostedName: string;
  if (!roomName) {
    // Prefer Coffee Shop if we host it; otherwise create a small open hangout.
    const coffee = deps.rooms.getRoom(COFFEE_SHOP_ROOM_ID);
    if (coffee) {
      roomId = COFFEE_SHOP_ROOM_ID;
      hostedName = coffee.descriptor.name;
    } else {
      const descriptor = deps.rooms.createRoom({
        hostDid: deps.identity.did,
        name: `Hangout with ${deps.selfDisplayName || "friends"}`,
        admission: "open",
        maxMembers: 16,
      });
      await deps.mlsStore.createRoomHost({
        localDid: deps.identity.did,
        roomId: descriptor.roomId,
      });
      roomId = descriptor.roomId;
      hostedName = descriptor.name;
    }
  } else {
    const descriptor = deps.rooms.createRoom({
      hostDid: deps.identity.did,
      name: roomName,
      admission: "open",
      maxMembers: 16,
    });
    await deps.mlsStore.createRoomHost({
      localDid: deps.identity.did,
      roomId: descriptor.roomId,
    });
    roomId = descriptor.roomId;
    hostedName = descriptor.name;
  }

  const hostUrl = deps.publicBaseUrl.replace(/\/$/, "");
  const invite = await createRoomInvite({
    identity: deps.identity,
    payload: {
      roomId,
      hostUrl,
      roomName: hostedName,
      note,
    },
  });
  await deliverSignedObject({
    mlsStore: deps.mlsStore,
    peerUrl: resolved.peerUrl,
    peerDid: resolved.peerDid,
    object: invite,
    encrypt: true,
  });
  return JSON.stringify({
    ok: true,
    invited: member.displayName,
    roomId,
    roomName: hostedName,
    message: `Invited ${member.displayName} to ${hostedName}. They should appear in the room members list when they accept.`,
  });
}

export async function executeChallengeFriendToGame(
  deps: SwarmSocialDeps,
  argsJson: string,
  fallbackPeerDid?: string,
): Promise<string> {
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson);
  } catch {
    return JSON.stringify({ error: "invalid JSON arguments" });
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const opponent = typeof obj.opponent === "string" ? obj.opponent.trim() : "";
  const game = typeof obj.game === "string" ? obj.game.trim() : "tictactoe";
  if (!opponent) return JSON.stringify({ error: "opponent is required" });
  if (game !== "tictactoe") {
    return JSON.stringify({ error: "only tictactoe is supported right now" });
  }

  const resolved = await resolveOpponentEndpoint(deps, opponent, fallbackPeerDid);
  if ("error" in resolved) return JSON.stringify(resolved);

  const gameId = `ttt-${Date.now().toString(36)}`;
  const board = emptySwarmTttBoard();
  const opening = pickSwarmTttBotMove(board, "X");
  if (opening == null) return JSON.stringify({ error: "could not pick opening move" });
  const next = applySwarmTttMove(board, opening, "X");

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
    peerUrl: resolved.peerUrl,
    peerDid: resolved.peerDid,
    object: state,
    encrypt: true,
  });
  return JSON.stringify({
    ok: true,
    gameId,
    opponent: resolved.label,
    openingCell: opening,
    message: `Started tic-tac-toe vs ${resolved.label}. You are X; waiting for their move.`,
  });
}
