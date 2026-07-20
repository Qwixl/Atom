/**
 * Swarm NPC auto-accept of room:invite objects (D090).
 */

import { ROOM_INVITE_PURPOSE } from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import type { AgentKindConfig } from "./config.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import { joinRemoteRoom } from "./roomJoinRemote.js";
import type { RoomStore } from "./roomStore.js";

interface RoomInvitePayload {
  roomId: string;
  hostUrl: string;
  roomName: string;
  note?: string;
}

export interface SwarmRoomInviteAcceptDeps {
  agentKind: AgentKindConfig;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  rooms: RoomStore;
  publicBaseUrl: string;
  selfDisplayName?: string;
}

export function extractRoomInvitePayload(object: DataObject): RoomInvitePayload | null {
  if (object.governance.purpose !== ROOM_INVITE_PURPOSE) return null;
  const p = object.payload as Record<string, unknown> | undefined;
  if (!p) return null;
  const roomId = typeof p.roomId === "string" ? p.roomId.trim() : "";
  const hostUrl = typeof p.hostUrl === "string" ? p.hostUrl.trim() : "";
  const roomName = typeof p.roomName === "string" ? p.roomName.trim() : "";
  if (!roomId || !hostUrl || !roomName) return null;
  return {
    roomId,
    hostUrl,
    roomName,
    note: typeof p.note === "string" ? p.note.trim() : undefined,
  };
}

export async function maybeAcceptSwarmRoomInvite(
  deps: SwarmRoomInviteAcceptDeps,
  object: DataObject,
): Promise<{ accepted: boolean; reason?: string; roomId?: string }> {
  if (deps.agentKind !== "swarm-npc") {
    return { accepted: false, reason: "not_swarm_npc" };
  }
  const payload = extractRoomInvitePayload(object);
  if (!payload) {
    return { accepted: false, reason: "not_room_invite" };
  }
  try {
    const result = await joinRemoteRoom(
      {
        identity: deps.identity,
        mlsStore: deps.mlsStore,
        rooms: deps.rooms,
        peerRecords: deps.peerRecords,
        publicBaseUrl: deps.publicBaseUrl,
      },
      {
        hostUrl: payload.hostUrl,
        roomId: payload.roomId,
        memberName: deps.selfDisplayName,
      },
    );
    console.log(
      `[swarm-room] accepted invite to ${payload.roomName} (${result.joined}) already=${result.alreadyMember}`,
    );
    return { accepted: true, roomId: result.joined };
  } catch (error) {
    console.warn(
      `[swarm-room] invite accept failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
