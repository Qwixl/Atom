/** Room activity definitions — emoji now; animationKey reserved for full-screen FX later. */

export type RoomActivityDef = {
  id: string;
  label: string;
  emoji: string;
  /** Future: confetti | hearts | steam | ticker — shell may ignore until FX ships. */
  animationKey?: string;
};

export const VENUE_ACTIVITY_PRESETS: Record<string, RoomActivityDef[]> = {
  "room:coffeeshop": [
    { id: "coffee-order", label: "Ordered a coffee", emoji: "☕", animationKey: "steam" },
    { id: "coffee-listen", label: "Listening to lo-fi", emoji: "🎧" },
    { id: "coffee-introduce", label: "Introduced myself", emoji: "👋" },
    { id: "coffee-reading", label: "Reading in the corner", emoji: "📖" },
  ],
  "room:church": [
    { id: "church-faith", label: "Keeping the faith", emoji: "✝️" },
    { id: "church-sing", label: "Singing Hallelujah!", emoji: "🎶", animationKey: "hearts" },
    { id: "church-prayer", label: "In prayer", emoji: "🙏" },
    { id: "church-donate", label: "Made a Donation", emoji: "💝" },
  ],
  "room:gym": [
    { id: "gym-iron", label: "Pumping Iron", emoji: "💪" },
    { id: "gym-treadmill", label: "Sweating on the treadmill", emoji: "🏃" },
    { id: "gym-smoothie", label: "Ordered a smoothie", emoji: "🥤" },
    { id: "gym-stretch", label: "Stretching it out", emoji: "🧘" },
  ],
  "room:movie-theatre": [
    { id: "theatre-popcorn", label: "Grabbed popcorn", emoji: "🍿" },
    { id: "theatre-watching", label: "Eyes on the screen", emoji: "🎬" },
    { id: "theatre-spoiler-free", label: "Staying spoiler-free", emoji: "🤐" },
    { id: "theatre-encore", label: "Calling for an encore", emoji: "👏", animationKey: "confetti" },
  ],
  "room:university": [
    { id: "uni-study", label: "Hitting the books", emoji: "📚" },
    { id: "uni-office-hours", label: "At office hours", emoji: "🧑‍🏫" },
    { id: "uni-eureka", label: "Had an aha moment", emoji: "💡", animationKey: "confetti" },
    { id: "uni-coffee", label: "Study-fuel coffee", emoji: "☕" },
  ],
  "room:atom-hq": [
    { id: "hq-brainstorm", label: "Brain Storming", emoji: "🧠" },
    { id: "hq-lunch", label: "Eating Lunch", emoji: "🥗" },
    { id: "hq-coffee", label: "Making a Coffee", emoji: "☕", animationKey: "steam" },
    { id: "hq-overtime", label: "Working Overtime", emoji: "🌙" },
    { id: "hq-brilliant", label: "Being Brilliant!", emoji: "✨", animationKey: "confetti" },
  ],
};

export function normalizeActivities(raw: unknown): RoomActivityDef[] {
  if (!Array.isArray(raw)) return [];
  const out: RoomActivityDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const label = String(row.label ?? "").trim();
    const emoji = String(row.emoji ?? "").trim() || "✨";
    if (!id || !label) continue;
    const animationKey = String(row.animationKey ?? "").trim() || undefined;
    out.push({ id: id.slice(0, 64), label: label.slice(0, 80), emoji: emoji.slice(0, 8), animationKey });
  }
  return out.slice(0, 24);
}

export function activitiesForRoomId(roomId: string, existing?: RoomActivityDef[]): RoomActivityDef[] {
  if (existing && existing.length > 0) return normalizeActivities(existing);
  return VENUE_ACTIVITY_PRESETS[roomId] ?? [];
}
