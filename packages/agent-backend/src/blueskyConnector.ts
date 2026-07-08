import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import { fetchJson, fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const BLUESKY_CONNECTOR_ID = "bluesky";
const DEFAULT_PDS = "https://bsky.social";

export const BLUESKY_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Bluesky handle and app password are configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listTimeline",
    permission: "read",
    description: "List home timeline posts (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listNotifications",
    permission: "read",
    description: "List recent notifications (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function blueskyConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return BLUESKY_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export function normalizeBlueskyPdsUrl(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_PDS;
  return validateConnectorHttpsUrl(trimmed).replace(/\/+$/, "");
}

function requireBlueskyAccount(vault: ConnectorVault): { handle: string; appPassword: string; pdsUrl: string } {
  const stored = vault.getBlueskyAccount();
  if (!stored?.handle || !stored.appPassword) {
    throw new Error("Bluesky not configured — add handle and app password in Settings → Connectors");
  }
  return {
    handle: stored.handle,
    appPassword: stored.appPassword,
    pdsUrl: normalizeBlueskyPdsUrl(stored.pdsUrl),
  };
}

async function blueskySession(pdsUrl: string, handle: string, appPassword: string): Promise<string> {
  const raw = (await fetchJson(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    body: { identifier: handle, password: appPassword },
  })) as { accessJwt?: string };
  const accessJwt = raw.accessJwt?.trim();
  if (!accessJwt) {
    throw new Error("Bluesky session failed — check handle and app password");
  }
  return accessJwt;
}

function summarizePost(item: Record<string, unknown>) {
  const post = item.post as Record<string, unknown> | undefined;
  const record = post?.record as Record<string, unknown> | undefined;
  const author = post?.author as Record<string, unknown> | undefined;
  return {
    uri: post?.uri,
    createdAt: record?.createdAt ?? post?.indexedAt,
    text: record?.text,
    authorHandle: author?.handle,
    authorDisplayName: author?.displayName,
  };
}

export async function invokeBlueskyConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = blueskyConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getBlueskyAccount();
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.handle && stored.appPassword),
          configuredAt: stored?.configuredAt,
          provider: "bluesky",
        },
      };
    }
    case "listTimeline": {
      const { handle, appPassword, pdsUrl } = requireBlueskyAccount(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 50);
      const accessJwt = await blueskySession(pdsUrl, handle, appPassword);
      const raw = (await fetchJsonWithBearerToken(
        `${pdsUrl}/xrpc/app.bsky.feed.getTimeline?limit=${limit}`,
        accessJwt,
      )) as { feed?: Array<Record<string, unknown>> };
      const posts = Array.isArray(raw.feed) ? raw.feed.map(summarizePost) : [];
      return { operation: operationId, result: { posts } };
    }
    case "listNotifications": {
      const { handle, appPassword, pdsUrl } = requireBlueskyAccount(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 50);
      const accessJwt = await blueskySession(pdsUrl, handle, appPassword);
      const raw = (await fetchJsonWithBearerToken(
        `${pdsUrl}/xrpc/app.bsky.notification.listNotifications?limit=${limit}`,
        accessJwt,
      )) as { notifications?: Array<Record<string, unknown>> };
      const notifications = Array.isArray(raw.notifications)
        ? raw.notifications.map((item) => ({
            uri: item.uri,
            reason: item.reason,
            isRead: item.isRead,
            indexedAt: item.indexedAt,
            authorHandle: (item.author as { handle?: string } | undefined)?.handle,
          }))
        : [];
      return { operation: operationId, result: { notifications } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
