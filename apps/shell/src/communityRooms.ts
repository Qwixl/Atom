import { COMMUNITY_HOST_PUBLIC_URL, CONTROL_PLANE_URL } from "./hostConfig.js";
import { supabaseAccessToken } from "./auth/hostedAccount.js";
import type { RoomActivityDef } from "./roomActivities.js";
import type { CatalogRoom } from "./roomUtils.js";

export async function fetchCommunityRoomCatalog(): Promise<{
  rooms: CatalogRoom[];
  hostUrl: string;
}> {
  const hostUrl = COMMUNITY_HOST_PUBLIC_URL.replace(/\/$/, "");
  const resp = await fetch(`${hostUrl}/rooms/catalog`);
  if (!resp.ok) {
    throw new Error(`Room catalog failed (${resp.status})`);
  }
  const body = (await resp.json()) as { rooms?: CatalogRoom[]; hostUrl?: string };
  return {
    rooms: body.rooms ?? [],
    hostUrl: (body.hostUrl ?? hostUrl).replace(/\/$/, ""),
  };
}

export async function createCommunityRoom(input: {
  name: string;
  description?: string;
  category: string;
  admission: "open" | "invite" | "request";
  hostRules: string[];
  acceptedBaseRules: true;
  creatorDid?: string;
  activities?: RoomActivityDef[];
}): Promise<{ room: CatalogRoom; hostUrl: string }> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required to create a room");
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = (await resp.json().catch(() => ({}))) as {
    room?: CatalogRoom;
    hostUrl?: string;
    error?: string;
  };
  if (!resp.ok) throw new Error(body.error ?? `Create room failed (${resp.status})`);
  if (!body.room) throw new Error("Create room returned no room");
  return {
    room: body.room,
    hostUrl: (body.hostUrl ?? COMMUNITY_HOST_PUBLIC_URL).replace(/\/$/, ""),
  };
}

export async function fetchRoomCreationStatus(): Promise<{
  enabled: boolean;
  killSwitch: boolean;
  denied: boolean;
}> {
  const token = await supabaseAccessToken();
  if (!token) return { enabled: false, killSwitch: false, denied: false };
  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/room-creation`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { enabled: false, killSwitch: false, denied: false };
  return (await resp.json()) as { enabled: boolean; killSwitch: boolean; denied: boolean };
}

export type JoinRequestWire = {
  id: string;
  roomId: string;
  memberDid: string;
  memberName?: string;
  endpoint?: string;
  status: string;
  createdAt?: string;
};

export async function fetchRoomJoinRequests(roomId: string): Promise<JoinRequestWire[]> {
  const token = await supabaseAccessToken();
  if (!token) return [];
  const resp = await fetch(
    `${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/rooms/${encodeURIComponent(roomId)}/join-requests`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) return [];
  const body = (await resp.json()) as { requests?: JoinRequestWire[] };
  return body.requests ?? [];
}

export async function decideRoomJoinRequest(
  roomId: string,
  requestId: string,
  decision: "approved" | "denied",
): Promise<void> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");
  const resp = await fetch(
    `${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/rooms/${encodeURIComponent(roomId)}/join-requests/${encodeURIComponent(requestId)}/decide`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision }),
    },
  );
  const body = (await resp.json().catch(() => ({}))) as { error?: string };
  if (!resp.ok) throw new Error(body.error ?? `Join decision failed (${resp.status})`);
}

export async function updateCommunityRoomActivities(
  roomId: string,
  activities: RoomActivityDef[],
): Promise<CatalogRoom> {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in required");
  const resp = await fetch(
    `${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/rooms/${encodeURIComponent(roomId)}/activities`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ activities }),
    },
  );
  const body = (await resp.json().catch(() => ({}))) as { room?: CatalogRoom; error?: string };
  if (!resp.ok) throw new Error(body.error ?? `Update activities failed (${resp.status})`);
  if (!body.room) throw new Error("Update activities returned no room");
  return body.room;
}
