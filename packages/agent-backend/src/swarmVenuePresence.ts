/**
 * NPC home-venue shift presence (D093 / AS-19).
 * During shift: join home room. Off shift: leave so the NPC can visit elsewhere.
 */

import type { AgentKeyPair } from "@qwixl/protocol";
import {
  findSwarmVenue,
  loadSwarmNpcSeedMeta,
  type SwarmHomeShift,
  type SwarmVenueBrief,
} from "./swarmCommunity.js";
import { joinRemoteRoom, leaveRemoteRoom } from "./roomJoinRemote.js";
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import type { RoomStore } from "./roomStore.js";

export interface SwarmVenuePresenceDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  rooms: RoomStore;
  peerRecords: MlsPeerRecordStore;
  publicBaseUrl: string;
  swarmSeedId?: string;
}

export type VenuePresenceAction = "joined" | "already_present" | "left" | "already_absent" | "noop";

export interface VenuePresenceTickResult {
  ok: true;
  seedId: string;
  placeId: string;
  onShift: boolean;
  action: VenuePresenceAction;
  localHour: number;
  timezone: string;
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

/** On shift when startHour <= localHour < endHour (e.g. 9–17 → until 17:00 exclusive). */
export function isOnHomeShift(
  now: Date,
  venue: Pick<SwarmVenueBrief, "timezone">,
  shift: SwarmHomeShift,
): { onShift: boolean; localHour: number; timezone: string } {
  const timezone = venue.timezone?.trim() || "Europe/London";
  const localHour = hourInTimeZone(now, timezone);
  const onShift = localHour >= shift.startHour && localHour < shift.endHour;
  return { onShift, localHour, timezone };
}

export async function runVenuePresenceTick(
  deps: SwarmVenuePresenceDeps,
  now = new Date(),
): Promise<VenuePresenceTickResult | { ok: false; reason: string }> {
  const seedId = deps.swarmSeedId?.trim();
  if (!seedId) return { ok: false, reason: "swarm seed id not configured" };

  const meta = loadSwarmNpcSeedMeta(seedId);
  if (!meta) return { ok: false, reason: `unknown seed "${seedId}"` };
  if (!meta.homePlace || !meta.homeShift) {
    return { ok: false, reason: "no homeShift configured for this NPC" };
  }

  const venue = findSwarmVenue(meta.homePlace);
  if (!venue?.hostUrl?.trim() || !venue.roomId?.trim()) {
    return { ok: false, reason: `venue "${meta.homePlace}" missing hostUrl/roomId` };
  }

  const { onShift, localHour, timezone } = isOnHomeShift(now, venue, meta.homeShift);
  const roomId = venue.roomId.trim();
  const hostUrl = venue.hostUrl.trim();
  const joined = deps.rooms.getJoinedRoom(roomId);
  const hasSession = deps.mlsStore.hasRoomSession(roomId);
  const isPresent = Boolean(joined && hasSession);

  const joinDeps = {
    identity: deps.identity,
    mlsStore: deps.mlsStore,
    rooms: deps.rooms,
    peerRecords: deps.peerRecords,
    publicBaseUrl: deps.publicBaseUrl,
  };

  if (onShift) {
    if (isPresent) {
      return {
        ok: true,
        seedId,
        placeId: meta.homePlace,
        onShift,
        action: "already_present",
        localHour,
        timezone,
      };
    }
    const result = await joinRemoteRoom(joinDeps, {
      hostUrl,
      roomId,
      memberName: meta.displayName,
    });
    return {
      ok: true,
      seedId,
      placeId: meta.homePlace,
      onShift,
      action: result.alreadyMember ? "already_present" : "joined",
      localHour,
      timezone,
    };
  }

  if (!joined && !hasSession) {
    return {
      ok: true,
      seedId,
      placeId: meta.homePlace,
      onShift,
      action: "already_absent",
      localHour,
      timezone,
    };
  }

  const left = await leaveRemoteRoom(joinDeps, roomId);
  return {
    ok: true,
    seedId,
    placeId: meta.homePlace,
    onShift,
    action: left.alreadyLeft ? "already_absent" : "left",
    localHour,
    timezone,
  };
}
