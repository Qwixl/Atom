/** Map registry module id (e.g. `community/coffee-shop`) to shell bundle path. */
export function moduleBundleUrl(moduleId: string): string {
  const slug = moduleId.trim().replace(/\//g, "-");
  // Module bundles are static assets at site root (/modules/…), not under the /app/ SPA base.
  return `/modules/${slug}/index.html`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  order: "ordered coffee",
  listen: "is listening along",
  introduce: "introduced themselves",
  leave: "left the room",
  moderation: "moderation action",
  reading: "joined the reading corner",
};

export function formatRoomActivity(activityKind: string | undefined): string {
  if (!activityKind) return "activity";
  return ACTIVITY_LABELS[activityKind] ?? activityKind.replace(/-/g, " ");
}
