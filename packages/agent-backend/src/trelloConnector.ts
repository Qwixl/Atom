import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJson } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const TRELLO_CONNECTOR_ID = "trello";
const TRELLO_API = "https://api.trello.com/1";

export const TRELLO_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether Trello API key and token are configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listBoards",
    permission: "read",
    description: "List boards for the token owner.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listOpenCards",
    permission: "read",
    description: "List open cards on a board (input.boardId required).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function trelloConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return TRELLO_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireTrelloCredentials(vault: ConnectorVault): { apiKey: string; token: string } {
  const stored = vault.getTrelloCredentials();
  if (!stored?.apiKey || !stored.token) {
    throw new Error("Trello not configured — add API key and token in Settings → Connectors");
  }
  return { apiKey: stored.apiKey, token: stored.token };
}

function trelloUrl(path: string, apiKey: string, token: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TRELLO_API}${path}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function invokeTrelloConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = trelloConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getTrelloCredentials();
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.apiKey && stored.token),
          configuredAt: stored?.configuredAt,
          provider: "trello",
        },
      };
    }
    case "listBoards": {
      const { apiKey, token } = requireTrelloCredentials(ctx.vault);
      const raw = (await fetchJson(
        trelloUrl("/members/me/boards", apiKey, token, { fields: "name,url,closed" }),
      )) as Array<Record<string, unknown>>;
      const boards = Array.isArray(raw)
        ? raw
            .filter((board) => board.closed !== true)
            .map((board) => ({
              id: board.id,
              name: board.name,
              url: board.url,
            }))
        : [];
      return { operation: operationId, result: { boards } };
    }
    case "listOpenCards": {
      const boardId = String(input.boardId ?? "").trim();
      if (!boardId) {
        throw new Error("boardId required");
      }
      const { apiKey, token } = requireTrelloCredentials(ctx.vault);
      const raw = (await fetchJson(
        trelloUrl(`/boards/${encodeURIComponent(boardId)}/cards`, apiKey, token, {
          fields: "name,url,due,dueComplete,closed",
        }),
      )) as Array<Record<string, unknown>>;
      const cards = Array.isArray(raw)
        ? raw
            .filter((card) => card.closed !== true)
            .map((card) => ({
              id: card.id,
              name: card.name,
              url: card.url,
              due: card.due,
              dueComplete: card.dueComplete,
            }))
        : [];
      return { operation: operationId, result: { boardId, cards } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
