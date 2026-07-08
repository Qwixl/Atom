import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchGoogleNewsItems } from "./newsSearchFeed.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const NEWS_SEARCH_CONNECTOR_ID = "news-search";

export const NEWS_SEARCH_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "searchItems",
    permission: "read",
    description: "Search public news headlines via Google News RSS (ephemeral, no vault).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function newsSearchConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return NEWS_SEARCH_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export async function invokeNewsSearchConnector(
  _ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = newsSearchConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "searchItems": {
      const query = String(input.query ?? "").trim();
      if (!query) {
        throw new Error("query required");
      }
      const limit = Number(input.limit ?? 10);
      const items = await fetchGoogleNewsItems(query, Number.isFinite(limit) ? limit : 10);
      return {
        operation: operationId,
        result: { query, items, source: "google-news-rss" },
      };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
