import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const GITHUB_CONNECTOR_ID = "github";
const GITHUB_API = "https://api.github.com";

export const GITHUB_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a GitHub personal access token is configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listNotifications",
    permission: "read",
    description: "List recent GitHub notifications (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listAssignedIssues",
    permission: "read",
    description: "List open issues assigned to the token owner (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function githubConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return GITHUB_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireGithubToken(vault: ConnectorVault): string {
  const stored = vault.getApiToken(GITHUB_CONNECTOR_ID);
  if (!stored?.token) {
    throw new Error("GitHub not configured — add a fine-grained PAT in Settings → Connectors");
  }
  return stored.token;
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export async function invokeGithubConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = githubConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getApiToken(GITHUB_CONNECTOR_ID);
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.token),
          configuredAt: stored?.configuredAt,
          provider: "github",
        },
      };
    }
    case "listNotifications": {
      const token = requireGithubToken(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 50);
      const raw = (await fetchJsonWithBearerToken(
        `${GITHUB_API}/notifications?per_page=${limit}`,
        token,
        { headers: GITHUB_HEADERS },
      )) as Array<Record<string, unknown>>;
      const notifications = Array.isArray(raw)
        ? raw.map((item) => ({
            id: item.id,
            reason: item.reason,
            unread: item.unread,
            updatedAt: item.updated_at,
            title: (item.subject as { title?: string } | undefined)?.title,
            type: (item.subject as { type?: string } | undefined)?.type,
            url: (item.subject as { url?: string } | undefined)?.url,
          }))
        : [];
      return { operation: operationId, result: { notifications } };
    }
    case "listAssignedIssues": {
      const token = requireGithubToken(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 50);
      const raw = (await fetchJsonWithBearerToken(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent("is:open is:issue assignee:@me")}&per_page=${limit}`,
        token,
        { headers: GITHUB_HEADERS },
      )) as { items?: Array<Record<string, unknown>> };
      const items = Array.isArray(raw.items)
        ? raw.items.map((issue) => ({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.html_url,
            repository: (issue.repository_url as string | undefined)?.replace(
              `${GITHUB_API}/repos/`,
              "",
            ),
            updatedAt: issue.updated_at,
          }))
        : [];
      return { operation: operationId, result: { issues: items } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
