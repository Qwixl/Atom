/**
 * Shared remote room join (admin route + swarm room-invite auto-accept).
 */

import type { AgentKeyPair } from "@qwixl/protocol";
import { connectMlsPeer } from "./mlsReconnect.js";
import { adminBaseFromPeerUrl, type MlsSessionStore } from "./mlsSessions.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { RoomDescriptor, RoomStore } from "./roomStore.js";

export interface JoinRemoteRoomDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
  peerRecords: MlsPeerRecordStore;
  publicBaseUrl: string;
}

export async function joinRemoteRoom(
  deps: JoinRemoteRoomDeps,
  opts: { hostUrl: string; roomId: string; memberName?: string },
): Promise<{ joined: string; descriptor: RoomDescriptor | null; alreadyMember: boolean }> {
  const { identity, mlsStore, rooms, peerRecords, publicBaseUrl } = deps;
  const hostUrl = opts.hostUrl.trim();
  const roomId = opts.roomId.trim();
  if (!hostUrl || !roomId) {
    throw new Error("hostUrl and roomId required");
  }
  const adminBase = adminBaseFromPeerUrl(hostUrl);
  const joinedLocal = rooms.getJoinedRoom(roomId);
  if (joinedLocal && mlsStore.hasRoomSession(roomId)) {
    return { joined: roomId, descriptor: joinedLocal.descriptor, alreadyMember: true };
  }
  const memberKp = await mlsStore.memberKeyPackage(identity.did);
  const joinResp = await fetch(`${adminBase}/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memberDid: identity.did,
      memberEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
      memberName: opts.memberName?.trim(),
      keyPackageWire: Buffer.from(memberKp.wire).toString("base64"),
    }),
  });
  if (!joinResp.ok) {
    const err = (await joinResp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Host join failed (${joinResp.status})`);
  }
  const joined = (await joinResp.json()) as {
    alreadyMember?: boolean;
    handshake?: {
      initiatorDid: string;
      welcome: string;
      ratchetTree: string;
      memberDids?: string[];
    };
  };
  if (joined.alreadyMember) {
    if (!mlsStore.hasRoomSession(roomId)) {
      throw new Error(
        "You are listed in this room but MLS keys are missing on your agent — restart your agent or ask the host to remove and re-invite you.",
      );
    }
  } else if (joined.handshake) {
    await mlsStore.joinRoom({
      localDid: identity.did,
      roomId,
      handshake: {
        mediaType: "application/vnd.atom.mls-handshake+json;version=1",
        initiatorDid: joined.handshake.initiatorDid,
        welcome: joined.handshake.welcome,
        ratchetTree: joined.handshake.ratchetTree,
        memberDids: joined.handshake.memberDids,
      },
      memberPackages: memberKp.packages,
    });
  } else {
    throw new Error("Host join returned no handshake");
  }
  const descriptorResp = await fetch(`${adminBase}/rooms/${encodeURIComponent(roomId)}`);
  const descriptorBody = descriptorResp.ok
    ? ((await descriptorResp.json()) as { descriptor?: RoomDescriptor })
    : {};
  const descriptor = descriptorBody.descriptor ?? null;
  if (descriptor) {
    rooms.rememberJoinedRoom({
      roomId,
      hostUrl: adminBase,
      descriptor,
    });
  }
  if (descriptor && !mlsStore.hasSession(descriptor.hostDid)) {
    try {
      await connectMlsPeer({
        mlsStore,
        peerRecords,
        localDid: identity.did,
        peerDid: descriptor.hostDid,
        peerUrl: `${adminBase}/a2a/jsonrpc`,
        initiatorEndpoint: `${publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
      });
    } catch (error) {
      console.warn(
        `[rooms] host MLS pair connect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    joined: roomId,
    descriptor,
    alreadyMember: Boolean(joined.alreadyMember),
  };
}

/** Leave a remote room this agent previously joined (notify host + drop local MLS). */
export async function leaveRemoteRoom(
  deps: Pick<JoinRemoteRoomDeps, "identity" | "mlsStore" | "rooms">,
  roomIdRaw: string,
): Promise<{ left: string; alreadyLeft: boolean }> {
  const roomId = roomIdRaw.trim();
  if (!roomId) throw new Error("roomId required");
  const { identity, mlsStore, rooms } = deps;
  const joined = rooms.getJoinedRoom(roomId);
  if (!joined) {
    if (mlsStore.hasRoomSession(roomId)) {
      mlsStore.dropRoomSession(roomId);
    }
    return { left: roomId, alreadyLeft: true };
  }
  try {
    await fetch(`${joined.hostUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberDid: identity.did }),
    });
  } catch (error) {
    console.warn(
      `[rooms] host leave notify failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  rooms.forgetJoinedRoom(roomId);
  mlsStore.dropRoomSession(roomId);
  return { left: roomId, alreadyLeft: false };
}
