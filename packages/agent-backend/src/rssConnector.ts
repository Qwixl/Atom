import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchRssItems } from "./rssFeed.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const RSS_CONNECTOR_ID = "rss";

export const RSS_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return configured RSS/Atom feed labels (not URLs).",
    cacheTtlMs: 0,
  },
  {
    id: "listItems",
    permission: "read",
    description: "List recent items from configured feeds.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listPodcastItems",
    permission: "read",
    description: "List recent RSS items that include audio enclosures (podcasts).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function rssConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return RSS_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export async function invokeRssConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = rssConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }
  const feeds = ctx.vault.getRssFeeds();

  switch (operationId) {
    case "getStatus":
      return {
        operation: operationId,
        result: {
          connected: feeds.length > 0,
          feedCount: feeds.length,
          feeds: feeds.map((feed) => ({ id: feed.id, label: feed.label })),
          provider: "rss",
        },
      };
    case "listItems": {
      if (feeds.length === 0) {
        throw new Error("No RSS feeds configured — add a feed in Settings");
      }
      const feedId = String(input.feedId ?? "").trim();
      const selected = feedId ? feeds.filter((feed) => feed.id === feedId) : feeds;
      if (feedId && selected.length === 0) {
        throw new Error(`Unknown feed id "${feedId}"`);
      }
      const limit = Number(input.limit ?? 20);
      const items = await fetchRssItems(selected, Number.isFinite(limit) ? limit : 20);
      return { operation: operationId, result: { items } };
    }
    case "listPodcastItems": {
      if (feeds.length === 0) {
        throw new Error("No RSS feeds configured — add a podcast RSS feed in Settings");
      }
      const feedId = String(input.feedId ?? "").trim();
      const selected = feedId ? feeds.filter((feed) => feed.id === feedId) : feeds;
      if (feedId && selected.length === 0) {
        throw new Error(`Unknown feed id "${feedId}"`);
      }
      const limit = Number(input.limit ?? 20);
      const allItems = await fetchRssItems(selected, Number.isFinite(limit) ? limit : 20);
      const items = allItems.filter(
        (item) =>
          Boolean(item.enclosureUrl) &&
          (!item.enclosureType || item.enclosureType.startsWith("audio/")),
      );
      return { operation: operationId, result: { items } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function addRssFeedToVault(
  vault: ConnectorVault,
  rawUrl: string,
  label?: string,
): Promise<{ id: string; label: string }> {
  validateConnectorHttpsUrl(rawUrl);
  const feed = await vault.addRssFeed({
    label: label?.trim() || "News feed",
    url: rawUrl.trim(),
  });
  return { id: feed.id, label: feed.label };
}

export async function removeRssFeedFromVault(vault: ConnectorVault, feedId: string): Promise<boolean> {
  return vault.removeRssFeed(feedId.trim());
}
