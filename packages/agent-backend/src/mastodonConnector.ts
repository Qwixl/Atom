import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const MASTODON_CONNECTOR_ID = "mastodon";

export const MASTODON_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Mastodon instance URL and access token are configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listHomeTimeline",
    permission: "read",
    description: "List home timeline posts (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listNotifications",
    permission: "read",
    description: "List notifications (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function mastodonConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return MASTODON_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export function normalizeMastodonInstanceUrl(raw: string): string {
  return validateConnectorHttpsUrl(raw.trim()).replace(/\/+$/, "");
}

function requireMastodonInstance(vault: ConnectorVault): { instanceUrl: string; accessToken: string } {
  const stored = vault.getMastodonInstance();
  if (!stored?.instanceUrl || !stored.accessToken) {
    throw new Error("Mastodon not configured — add instance URL and token in Settings → Connectors");
  }
  return { instanceUrl: stored.instanceUrl, accessToken: stored.accessToken };
}

function summarizeStatus(status: Record<string, unknown>) {
  const account = status.account as Record<string, unknown> | undefined;
  return {
    id: status.id,
    createdAt: status.created_at,
    content: status.content,
    url: status.url,
    visibility: status.visibility,
    account: account
      ? {
          username: account.username,
          displayName: account.display_name,
          acct: account.acct,
        }
      : undefined,
  };
}

export async function invokeMastodonConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = mastodonConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getMastodonInstance();
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.instanceUrl && stored.accessToken),
          configuredAt: stored?.configuredAt,
          provider: "mastodon",
        },
      };
    }
    case "listHomeTimeline": {
      const { instanceUrl, accessToken } = requireMastodonInstance(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 40);
      const raw = (await fetchJsonWithBearerToken(
        `${instanceUrl}/api/v1/timelines/home?limit=${limit}`,
        accessToken,
      )) as Array<Record<string, unknown>>;
      const posts = Array.isArray(raw) ? raw.map(summarizeStatus) : [];
      return { operation: operationId, result: { posts } };
    }
    case "listNotifications": {
      const { instanceUrl, accessToken } = requireMastodonInstance(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 40);
      const raw = (await fetchJsonWithBearerToken(
        `${instanceUrl}/api/v1/notifications?limit=${limit}`,
        accessToken,
      )) as Array<Record<string, unknown>>;
      const notifications = Array.isArray(raw)
        ? raw.map((item) => ({
            id: item.id,
            type: item.type,
            createdAt: item.created_at,
            account: (item.account as { acct?: string; display_name?: string } | undefined)?.acct,
          }))
        : [];
      return { operation: operationId, result: { notifications } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
