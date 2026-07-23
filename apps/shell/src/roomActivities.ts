/** Shell mirror of agent-backend room activity defs (emoji now; animationKey later). */

export type RoomActivityDef = {
  id: string;
  label: string;
  emoji: string;
  animationKey?: string;
};

/** Fallback when catalog/descriptor omits activities (pre-seed hosts). */
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

export function resolveRoomActivities(
  roomId: string,
  fromDescriptor?: RoomActivityDef[] | null,
): RoomActivityDef[] {
  if (fromDescriptor && fromDescriptor.length > 0) return fromDescriptor;
  return VENUE_ACTIVITY_PRESETS[roomId] ?? [];
}

export function formatActivityDisplay(
  activityKind: string | undefined,
  payload?: Record<string, unknown> | null,
): string {
  const emoji = typeof payload?.emoji === "string" ? payload.emoji.trim() : "";
  const label = typeof payload?.label === "string" ? payload.label.trim() : "";
  if (emoji && label) return `${emoji} ${label}`;
  if (label) return label;
  if (!activityKind) return "activity";
  return activityKind.replace(/-/g, " ");
}
