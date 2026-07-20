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
}

export interface SwarmVenueBrief {
  id: string;
  displayName: string;
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
    }));
  return cachedRoster;
}

export function loadSwarmVenueBriefs(): SwarmVenueBrief[] {
  if (cachedVenues) return cachedVenues;
  const file = path.join(seedsDir(), "v1-venues.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    venues: Array<{ id: string; displayName: string }>;
  };
  cachedVenues = raw.venues.map((v) => ({ id: v.id, displayName: v.displayName }));
  return cachedVenues;
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
  return `## Your community

You live among named people in shared venues — not interchangeable copies of the same program.
You may know these neighbours; speak as yourself, with your own role and relationships.

### People
${people || "- (roster unavailable)"}

### Places
${places || "- (venues unavailable)"}`;
}

/** Test helper — clear module cache. */
export function clearSwarmCommunityCache(): void {
  cachedRoster = null;
  cachedVenues = null;
}
