/**
 * Community roster for NPC prompts (D089) — loaded from swarm-seeds.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SwarmCommunityMember {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  homePlace: string | null;
  agentKind: string;
  portHint?: number;
}

export interface SwarmVenueBrief {
  id: string;
  displayName: string;
  timezone?: string;
  hostUrl?: string;
  roomId?: string;
}

export interface SwarmHomeShift {
  startHour: number;
  endHour: number;
}

export interface SwarmNpcSeedMeta {
  id: string;
  displayName: string;
  homePlace: string | null;
  homeShift: SwarmHomeShift | null;
}

function seedsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../swarm-seeds");
}

let cachedRoster: SwarmCommunityMember[] | null = null;
let cachedVenues: SwarmVenueBrief[] | null = null;

export function loadSwarmCommunityRoster(): SwarmCommunityMember[] {
  if (cachedRoster) return cachedRoster;
  const file = path.join(seedsDir(), "v1-npcs.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    npcs: Array<{
      id: string;
      handle: string;
      displayName: string;
      homePlace?: string | null;
      agentKind?: string;
      portHint?: number;
      core: { role: string };
    }>;
  };
  cachedRoster = raw.npcs
    .filter((n) => n.agentKind !== "swarm-police")
    .map((n) => ({
      id: n.id,
      handle: n.handle,
      displayName: n.displayName,
      role: n.core.role,
      homePlace: n.homePlace ?? null,
      agentKind: n.agentKind === "swarm-police" ? "swarm-police" : "swarm-npc",
      portHint: typeof n.portHint === "number" ? n.portHint : undefined,
    }));
  return cachedRoster;
}

/** Resolve a community friend by handle, display name, or seed id. */
export function findSwarmCommunityMember(query: string): SwarmCommunityMember | null {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return null;
  const roster = loadSwarmCommunityRoster();
  return (
    roster.find((m) => m.id.toLowerCase() === q) ||
    roster.find((m) => m.handle.toLowerCase().replace(/^@/, "") === q) ||
    roster.find((m) => m.displayName.toLowerCase() === q) ||
    roster.find((m) => m.displayName.toLowerCase().startsWith(q)) ||
    null
  );
}

/**
 * Public base URL for a community NPC.
 * Uses ATOM_NPC_PUBLIC_URL_TEMPLATE (e.g. https://{port}.agents.atom.qwixl.com) or localhost.
 */
export function resolveCommunityMemberPublicUrl(member: SwarmCommunityMember): string | null {
  if (member.portHint == null) return null;
  const template =
    process.env.ATOM_NPC_PUBLIC_URL_TEMPLATE?.trim() || "http://127.0.0.1:{port}";
  if (!template.includes("{port}")) return null;
  return template.replaceAll("{port}", String(member.portHint)).replace(/\/$/, "");
}

export function loadSwarmVenueBriefs(): SwarmVenueBrief[] {
  if (cachedVenues) return cachedVenues;
  const file = path.join(seedsDir(), "v1-venues.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    venues: Array<{
      id: string;
      displayName: string;
      timezone?: string;
      hostUrl?: string;
      roomId?: string;
    }>;
  };
  cachedVenues = raw.venues.map((v) => ({
    id: v.id,
    displayName: v.displayName,
    timezone: typeof v.timezone === "string" ? v.timezone : undefined,
    hostUrl: typeof v.hostUrl === "string" ? v.hostUrl : undefined,
    roomId: typeof v.roomId === "string" ? v.roomId : undefined,
  }));
  return cachedVenues;
}

export function findSwarmVenue(placeId: string): SwarmVenueBrief | null {
  const id = placeId.trim();
  if (!id) return null;
  return loadSwarmVenueBriefs().find((v) => v.id === id) ?? null;
}

/** Load homePlace + homeShift for a seed id (e.g. mira-barista). */
export function loadSwarmNpcSeedMeta(seedId: string): SwarmNpcSeedMeta | null {
  const id = seedId.trim();
  if (!id) return null;
  const file = path.join(seedsDir(), "v1-npcs.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    npcs: Array<{
      id: string;
      displayName: string;
      homePlace?: string | null;
      homeShift?: { startHour?: number; endHour?: number };
    }>;
  };
  const npc = raw.npcs.find((n) => n.id === id);
  if (!npc) return null;
  const start = npc.homeShift?.startHour;
  const end = npc.homeShift?.endHour;
  const homeShift =
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= 24 &&
    start < end
      ? { startHour: start, endHour: end }
      : null;
  return {
    id: npc.id,
    displayName: npc.displayName,
    homePlace: npc.homePlace ?? null,
    homeShift,
  };
}

/** Home-shift duty for NPCs with homeShift in seed (AS-19). */
export function formatHomeShiftBlock(selfId?: string): string {
  if (!selfId?.trim()) return "";
  const meta = loadSwarmNpcSeedMeta(selfId);
  if (!meta?.homePlace || !meta.homeShift) return "";
  const venue = findSwarmVenue(meta.homePlace);
  const tz = venue?.timezone?.trim() || "Europe/London";
  const place = venue?.displayName ?? meta.homePlace;
  const { startHour, endHour } = meta.homeShift;
  const start = `${String(startHour).padStart(2, "0")}:00`;
  const end = `${String(endHour).padStart(2, "0")}:00`;
  return `## Your work shift

Your home venue is **${place}** (\`${meta.homePlace}\`).
During **${start}–${end} ${tz}** you are on shift there (behind the counter / on duty). Stay present in that room; greet newcomers only within the greeter cap.
**Outside** those hours you may visit other venues and neighbours. Do not claim to be working the counter when off shift.`;
}

/** Markdown block: named locals + venues (excludes self by id when provided). */
export function formatSwarmCommunityBlock(selfId?: string): string {
  const roster = loadSwarmCommunityRoster().filter((m) => m.id !== selfId);
  const venues = loadSwarmVenueBriefs();
  const people = roster
    .map(
      (m) =>
        `- ${m.displayName} (${m.handle}): ${m.role}${m.homePlace ? ` — home: ${m.homePlace}` : ""}`,
    )
    .join("\n");
  const places = venues.map((v) => `- ${v.displayName} (\`${v.id}\`)`).join("\n");
  const shift = formatHomeShiftBlock(selfId);
  return `## Your community

You live among named people in shared venues — not interchangeable copies of the same program.
You may know these neighbours; speak as yourself, with your own role and relationships.

### People
${people || "- (roster unavailable)"}

### Places
${places || "- (venues unavailable)"}${shift ? `\n\n${shift}` : ""}`;
}

/** Test helper — clear module cache. */
export function clearSwarmCommunityCache(): void {
  cachedRoster = null;
  cachedVenues = null;
}
