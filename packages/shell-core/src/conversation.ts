import type { ResolvedSurface } from "./resolver.js";

/** One turn in the conversational channel between owner and agent. */
export type FeedItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "agent-text"; id: string; text: string }
  | { kind: "surface"; id: string; surface: ResolvedSurface };

/**
 * Shell feed policy: one active surface. Reuse surfaceId to update in place;
 * a new surfaceId replaces the previous surface. Text messages always append.
 */
export function upsertFeedSurface(
  feed: FeedItem[],
  surface: ResolvedSurface,
  id: string,
): FeedItem[] {
  const existing = feed.findIndex(
    (item) => item.kind === "surface" && item.surface.surfaceId === surface.surfaceId,
  );
  if (existing >= 0) {
    const prev = feed[existing];
    if (prev?.kind === "surface") {
      const next = [...feed];
      next[existing] = { kind: "surface", id: prev.id, surface };
      return next;
    }
  }
  const withoutSurfaces = feed.filter((item) => item.kind !== "surface");
  return [...withoutSurfaces, { kind: "surface", id, surface }];
}

export function appendAgentText(feed: FeedItem[], id: string, text: string): FeedItem[] {
  return [...feed, { kind: "agent-text", id, text }];
}

export function appendUserMessage(feed: FeedItem[], id: string, text: string): FeedItem[] {
  return [...feed, { kind: "user", id, text }];
}

export function clearFeed(): FeedItem[] {
  return [];
}
