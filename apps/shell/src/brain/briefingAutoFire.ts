import type { FeedItem } from "@qwixl/shell-core";
import { BRIEFING_SURFACE_ID } from "@qwixl/shell-core";
import type { BrainPendingNotification } from "../custody/client.js";
import { loadBriefingPreferences } from "../briefing/briefingPreferences.js";

/** Survives full page reload in the same tab — blocks re-composition spam. */
const SESSION_COMPOSED_KEY = "atom.briefing.compositionRequested";

/** Once per local calendar day for session-open (prefs toggle), across tabs. */
const OPEN_DAY_KEY = "atom.briefing.lastSessionOpenDay";

function localDayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True when Chat can run an agent turn that emits briefing-daily. */
export function canRequestBriefingComposition(provider: string): boolean {
  return provider === "llm" || provider === "ag-ui";
}

export function feedHasBriefingDailySurface(feed: readonly FeedItem[]): boolean {
  return feed.some(
    (item) => item.kind === "surface" && item.surface.surfaceId === BRIEFING_SURFACE_ID,
  );
}

/** Legacy brain stub copy that never got a composition turn. */
function isLegacyBriefingStubText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("ask me for today's briefing") ||
    (lower.includes("ask me") && lower.includes("briefing")) ||
    lower.includes("later wave")
  );
}

/**
 * Brain daily-briefing text already on the feed, but no briefing-daily surface yet.
 * Only true legacy stubs — thin titles ("Morning briefing") and "is ready" badges
 * must NOT re-trigger composition (surfaces are not persisted across reload).
 */
export function feedNeedsBriefingCompositionRecovery(feed: readonly FeedItem[]): boolean {
  if (feedHasBriefingDailySurface(feed)) return false;
  return feed.some((item) => {
    if (item.kind !== "agent-text") return false;
    if (item.origin === "brain" && item.brainKind === "daily-briefing") {
      return isLegacyBriefingStubText(item.text);
    }
    return isLegacyBriefingStubText(item.text);
  });
}

export function hasBriefingCompositionBeenRequestedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_COMPOSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBriefingCompositionRequestedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_COMPOSED_KEY, "1");
  } catch {
    /* private mode / blocked storage */
  }
}

export function hasSessionOpenBriefingRunToday(): boolean {
  try {
    return localStorage.getItem(OPEN_DAY_KEY) === localDayKey();
  } catch {
    return false;
  }
}

export function markSessionOpenBriefingRunToday(): void {
  try {
    localStorage.setItem(OPEN_DAY_KEY, localDayKey());
  } catch {
    /* private mode / blocked storage */
  }
}

export function shouldSessionOpenBriefing(options: {
  provider: string;
  alreadyRequested: boolean;
}): boolean {
  if (options.alreadyRequested) return false;
  if (hasBriefingCompositionBeenRequestedThisSession()) return false;
  if (hasSessionOpenBriefingRunToday()) return false;
  if (!canRequestBriefingComposition(options.provider)) return false;
  return loadBriefingPreferences().enabled === true;
}

/**
 * Standing-intent daily-briefing delivery: request composition unless this session
 * already requested one (in-memory). Do not use sessionStorage here — undelivered
 * pending after reload must still be able to compose once.
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

export function shouldRecoverBriefingComposition(options: {
  provider: string;
  alreadyRequested: boolean;
  feed: readonly FeedItem[];
}): boolean {
  if (options.alreadyRequested) return false;
  if (hasBriefingCompositionBeenRequestedThisSession()) return false;
  if (!canRequestBriefingComposition(options.provider)) return false;
  return feedNeedsBriefingCompositionRecovery(options.feed);
}
