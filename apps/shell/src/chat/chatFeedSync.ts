import type { FeedItem } from "@qwixl/shell-core";

export type ChatFeedTextItem = { kind: "user" | "agent-text"; id: string; text: string };

export type ChatFeedEnvelope = {
  workspaceId: string;
  items: ChatFeedTextItem[];
  updatedAt: string;
  revision: number;
};

export const CHAT_FEED_MAX_ITEMS = 200;

export function isChatFeedTextItem(value: unknown): value is ChatFeedTextItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.kind === "user" || item.kind === "agent-text") &&
    typeof item.id === "string" &&
    typeof item.text === "string"
  );
}

export function isChatFeedEnvelope(value: unknown): value is ChatFeedEnvelope {
  if (!value || typeof value !== "object") return false;
  const env = value as Record<string, unknown>;
  return (
    typeof env.workspaceId === "string" &&
    Array.isArray(env.items) &&
    env.items.every(isChatFeedTextItem) &&
    typeof env.updatedAt === "string" &&
    typeof env.revision === "number" &&
    Number.isFinite(env.revision)
  );
}

export function persistableChatFeed(feed: readonly FeedItem[]): ChatFeedTextItem[] {
  return feed
    .filter(
      (item): item is Extract<FeedItem, { kind: "user" | "agent-text" }> =>
        item.kind === "user" || item.kind === "agent-text",
    )
    .map(({ kind, id, text }) => ({ kind, id, text }))
    .slice(-CHAT_FEED_MAX_ITEMS);
}

export function feedItemsFromChatTexts(items: readonly ChatFeedTextItem[]): FeedItem[] {
  return items.filter(isChatFeedTextItem).map(({ kind, id, text }) => ({ kind, id, text }));
}

/** Merge two text feeds by id; later updatedAt / higher revision wins on conflict. Cap length. */
export function mergeChatFeedEnvelopes(
  local: ChatFeedEnvelope | null | undefined,
  remote: ChatFeedEnvelope | null | undefined,
  workspaceId: string,
): ChatFeedEnvelope {
  const localItems = local?.items?.filter(isChatFeedTextItem) ?? [];
  const remoteItems = remote?.items?.filter(isChatFeedTextItem) ?? [];
  if (localItems.length === 0 && remoteItems.length === 0) {
    return {
      workspaceId,
      items: [],
      updatedAt: new Date().toISOString(),
      revision: Math.max(local?.revision ?? 0, remote?.revision ?? 0, 1),
    };
  }
  if (localItems.length === 0 && remote) return { ...remote, workspaceId, items: remoteItems.slice(-CHAT_FEED_MAX_ITEMS) };
  if (remoteItems.length === 0 && local) return { ...local, workspaceId, items: localItems.slice(-CHAT_FEED_MAX_ITEMS) };

  const byId = new Map<string, ChatFeedTextItem>();
  const order: string[] = [];
  for (const item of [...remoteItems, ...localItems]) {
    if (!byId.has(item.id)) order.push(item.id);
    byId.set(item.id, item);
  }
  const items = order.map((id) => byId.get(id)!).slice(-CHAT_FEED_MAX_ITEMS);
  const revision = Math.max(local?.revision ?? 0, remote?.revision ?? 0) + 1;
  return {
    workspaceId,
    items,
    updatedAt: new Date().toISOString(),
    revision,
  };
}

export function makeChatFeedEnvelope(
  workspaceId: string,
  items: readonly ChatFeedTextItem[],
  previous?: ChatFeedEnvelope | null,
): ChatFeedEnvelope {
  return {
    workspaceId,
    items: items.filter(isChatFeedTextItem).slice(-CHAT_FEED_MAX_ITEMS),
    updatedAt: new Date().toISOString(),
    revision: (previous?.revision ?? 0) + 1,
  };
}
