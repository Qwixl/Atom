import type { FeedItem } from "@qwixl/shell-core";
import { BRIEFING_SURFACE_ID } from "@qwixl/shell-core";
import type { BrainPendingNotification } from "../custody/client.js";
import { loadBriefingPreferences } from "../briefing/briefingPreferences.js";

/** True when Chat can run an agent turn that emits briefing-daily. */
export function canRequestBriefingComposition(provider: string): boolean {
  return provider === "llm" || provider === "ag-ui";
}

export function feedHasBriefingDailySurface(feed: readonly FeedItem[]): boolean {
  return feed.some(
    (item) => item.kind === "surface" && item.surface.surfaceId === BRIEFING_SURFACE_ID,
  );
}

/**
 * Brain daily-briefing text already on the feed, but no briefing-daily surface yet
 * (e.g. stub delivered before auto-composition shipped, or hosted ag-ui skipped session-open).
 */
export function feedNeedsBriefingCompositionRecovery(feed: readonly FeedItem[]): boolean {
  if (feedHasBriefingDailySurface(feed)) return false;
  return feed.some((item) => {
    if (item.kind !== "agent-text") return false;
    if (item.origin === "brain" && item.brainKind === "daily-briefing") {
      const text = item.text.toLowerCase();
      return (
        text.includes("ask me") ||
        text.includes("later wave") ||
        text.includes("is ready") ||
        text === "morning briefing" ||
        text === "daily briefing" ||
        /^morning briefing:/i.test(item.text)
      );
    }
    // Legacy feed lines before brainKind was persisted.
    const text = item.text.toLowerCase();
    return text.includes("ask me for today's briefing") || text.includes("later wave");
  });
}

export function shouldSessionOpenBriefing(options: {
  provider: string;
  alreadyRequested: boolean;
}): boolean {
  if (options.alreadyRequested) return false;
  if (!canRequestBriefingComposition(options.provider)) return false;
  return loadBriefingPreferences().enabled === true;
}

/**
 * Standing-intent daily-briefing delivery: request composition unless this session
 * already requested one (session-open or prior fire).
 */
export function shouldFireBriefingFromPending(options: {
  notification: BrainPendingNotification;
  alreadyRequested: boolean;
  handledIds: ReadonlySet<string>;
}): boolean {
  if (options.notification.kind !== "daily-briefing") return false;
  if (options.handledIds.has(options.notification.id)) return false;
  if (options.alreadyRequested) return false;
  return true;
}
