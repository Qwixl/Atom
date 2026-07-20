/** Discover / chrome label for D087 swarm listings. */
export function swarmDiscoverBadge(entry: {
  agentKind?: "swarm-npc" | "swarm-police" | null;
}): { label: string; className: string } | null {
  if (entry.agentKind === "swarm-npc") {
    return { label: "Qwixl NPC", className: "discover-swarm discover-swarm--npc" };
  }
  if (entry.agentKind === "swarm-police") {
    return { label: "Police (ops)", className: "discover-swarm discover-swarm--police" };
  }
  return null;
}
