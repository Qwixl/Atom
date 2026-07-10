import type { ResolvedNode, ResolvedSurface } from "./resolver.js";
import type { JsonObject } from "./types.js";
import { findModuleEmbed, isInteractiveSurface } from "./games/feed.js";

/** Active module surface on the chat feed (for agent context). */
export interface ActiveFeedSurface {
  surfaceId: string;
  component?: string;
  intent?: string;
}

/** One turn in the conversational channel between owner and agent. */
export type FeedItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "agent-text";
      id: string;
      text: string;
      /** Shell-injected interrupt origin (Agent Brain, D077/BK-43). */
      origin?: "brain";
      /** Brain notification kind for badge copy. */
      brainKind?: "daily-briefing" | "reminder" | "watch";
    }
  | { kind: "surface"; id: string; surface: ResolvedSurface };

export const BRIEFING_SURFACE_ID = "briefing-daily";

export function isBriefingSurface(surface: ResolvedSurface): boolean {
  return surface.surfaceId === BRIEFING_SURFACE_ID;
}

/**
 * Shell feed policy:
 * - Read-only surfaces append and stay in chat history, except briefing-daily which replaces prior briefing.
 * - Interactive game surfaces are singular: update by surfaceId, replace prior games.
 * Text messages always append.
 */
export function upsertFeedSurface(
  feed: FeedItem[],
  surface: ResolvedSurface,
  id: string,
): FeedItem[] {
  if (!isInteractiveSurface(surface)) {
    if (isBriefingSurface(surface)) {
      const existingIdx = feed.findIndex(
        (item) => item.kind === "surface" && item.surface.surfaceId === surface.surfaceId,
      );
      if (existingIdx >= 0) {
        const prev = feed[existingIdx];
        if (prev?.kind === "surface") {
          const next = [...feed];
          next[existingIdx] = { kind: "surface", id: prev.id, surface };
          return next;
        }
      }
    }
    return [...feed, { kind: "surface", id, surface }];
  }
  const existingIdx = feed.findIndex(
    (item) => item.kind === "surface" && item.surface.surfaceId === surface.surfaceId,
  );
  if (existingIdx >= 0) {
    const prev = feed[existingIdx];
    if (prev?.kind === "surface") {
      const next = feed.filter((_, index) => index !== existingIdx);
      return [...next, { kind: "surface", id: prev.id, surface }];
    }
  }

  const withoutGames = feed.filter(
    (item) => item.kind !== "surface" || !isInteractiveSurface(item.surface),
  );
  return [...withoutGames, { kind: "surface", id, surface }];
}

export function appendAgentText(
  feed: FeedItem[],
  id: string,
  text: string,
  meta?: { origin?: "brain"; brainKind?: "daily-briefing" | "reminder" | "watch" },
): FeedItem[] {
  return [
    ...feed,
    {
      kind: "agent-text",
      id,
      text,
      ...(meta?.origin ? { origin: meta.origin } : {}),
      ...(meta?.brainKind ? { brainKind: meta.brainKind } : {}),
    },
  ];
}

export function appendUserMessage(feed: FeedItem[], id: string, text: string): FeedItem[] {
  return [...feed, { kind: "user", id, text }];
}

export function clearFeed(): FeedItem[] {
  return [];
}

function surfaceComponent(root: ResolvedNode): string | undefined {
  if (root.kind === "component" || root.kind === "substituted" || root.kind === "fallback") {
    return root.node.component;
  }
  return undefined;
}

/** Latest surface item on the feed (shell keeps one active surface). */
export function findActiveFeedSurface(feed: readonly FeedItem[]): ActiveFeedSurface | undefined {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (item?.kind === "surface") {
      return {
        surfaceId: item.surface.surfaceId,
        component: surfaceComponent(item.surface.root),
        intent: item.surface.intent,
      };
    }
  }
  return undefined;
}

/** Merge props onto a module node inside a resolved surface (in-place feed update). */
export function patchSurfaceNodeProps(
  surface: ResolvedSurface,
  componentName: string,
  propsPatch: JsonObject,
): ResolvedSurface {
  function patchNode(node: ResolvedNode): ResolvedNode {
    const children = node.children.map(patchNode);
    if (
      (node.kind === "component" || node.kind === "substituted") &&
      node.node.component === componentName
    ) {
      return {
        ...node,
        children,
        node: {
          ...node.node,
          props: { ...(node.node.props ?? {}), ...propsPatch },
        },
      };
    }
    return { ...node, children };
  }
  return { ...surface, root: patchNode(surface.root) };
}
