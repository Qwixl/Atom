import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const NOTION_CONNECTOR_ID = "notion";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export const NOTION_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Notion integration token is configured.",
    cacheTtlMs: 0,
  },
  {
    id: "search",
    permission: "read",
    description: "Search Notion pages and databases (input.query required; optional input.limit).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function notionConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return NOTION_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireNotionToken(vault: ConnectorVault): string {
  const stored = vault.getApiToken(NOTION_CONNECTOR_ID);
  if (!stored?.token) {
    throw new Error("Notion not configured — add an integration token in Settings → Connectors");
  }
  return stored.token;
}

function notionHeaders(): Record<string, string> {
  return { "Notion-Version": NOTION_VERSION };
}

function summarizeNotionResult(item: Record<string, unknown>) {
  const objectType = item.object;
  const properties = item.properties as Record<string, unknown> | undefined;
  let title = "";
  if (properties) {
    for (const value of Object.values(properties)) {
      const prop = value as { type?: string; title?: Array<{ plain_text?: string }> };
      if (prop.type === "title" && Array.isArray(prop.title)) {
        title = prop.title.map((part) => part.plain_text ?? "").join("");
        break;
      }
    }
  }
  return {
    id: item.id,
    object: objectType,
    title: title || undefined,
    url: item.url,
    lastEditedTime: item.last_edited_time,
  };
}

export async function invokeNotionConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = notionConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getApiToken(NOTION_CONNECTOR_ID);
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.token),
          configuredAt: stored?.configuredAt,
          provider: "notion",
        },
      };
    }
    case "search": {
      const token = requireNotionToken(ctx.vault);
      const query = String(input.query ?? "").trim();
      if (!query) {
        throw new Error("query required");
      }
      const limit = Math.min(Math.max(Number(input.limit ?? 10) || 10, 1), 25);
      const raw = (await fetchJsonWithBearerToken(`${NOTION_API}/search`, token, {
        method: "POST",
        headers: notionHeaders(),
        body: {
          query,
          page_size: limit,
        },
      })) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(raw.results) ? raw.results.map(summarizeNotionResult) : [];
      return { operation: operationId, result: { query, results } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
