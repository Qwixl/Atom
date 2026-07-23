import type { RoomActivityDef } from "./roomActivities.js";
import { formatActivityDisplay } from "./roomActivities.js";

/** Map registry module id (e.g. `community/coffee-shop`) to shell bundle path. */
export const COFFEE_SHOP_ROOM_ID = "room:coffeeshop";

export const TOWN_VENUE_ROOM_IDS = [
  "room:coffeeshop",
  "room:church",
  "room:gym",
  "room:movie-theatre",
  "room:university",
  "room:atom-hq",
] as const;

export type CatalogRoom = {
  roomId: string;
  name: string;
  topic?: string;
  description?: string;
  category: string;
  admission: "open" | "invite" | "request" | string;
  moduleId?: string;
  hostDid: string;
  status: "active" | "closed" | string;
  rules?: { basePolicyUrl: string; hostRules: string[] };
  creatorDid?: string;
  activities?: RoomActivityDef[];
  memberCount?: number;
  liveCount?: number;
};

export function moduleBundleUrl(moduleId: string): string {
  const slug = moduleId.trim().replace(/\//g, "-");
  if (!slug) return "";
  // Absolute origin-root path — must not resolve under /app/ (SPA rewrite + frame-ancestors 'none').
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://atom.qwixl.com";
  return `${origin}/modules/${slug}/index.html`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  order: "ordered coffee",
  listen: "is listening along",
  introduce: "introduced themselves",
  leave: "left the room",
  moderation: "moderation action",
  reading: "joined the reading corner",
  message_edit: "edited a message",
  message_delete: "deleted a message",
  friend_request: "sent a friend request",
  friend_accept: "accepted a friend request",
};

export function formatRoomActivity(
  activityKind: string | undefined,
  payload?: Record<string, unknown> | null,
): string {
  const fromPayload = formatActivityDisplay(activityKind, payload);
  if (payload?.emoji || payload?.label) return fromPayload;
  if (!activityKind) return "activity";
  return ACTIVITY_LABELS[activityKind] ?? fromPayload;
}
