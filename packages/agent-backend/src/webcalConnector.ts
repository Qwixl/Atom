import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { queryWebcalEvents, validateWebcalUrl } from "./webcal.js";

export const WEBCAL_CONNECTOR_ID = "webcal";

export type ConnectorPermission = "read" | "write";

export interface ConnectorOperationSpec {
  id: string;
  permission: ConnectorPermission;
  description: string;
  requiresApproval?: boolean;
  /** Requested read cache TTL (ms). Server caps via `resolveOperationCacheTtl`. */
  cacheTtlMs?: number;
}

/** Canonical operation surface — must match module manifest `connector.operations`. */
export const WEBCAL_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether WebCal feeds are configured and list feed labels (not URLs).",
    cacheTtlMs: 0,
  },
  {
    id: "listEvents",
    permission: "read",
    description: "List events from configured feeds between timeMin and timeMax (ISO 8601).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function connectorOperation(id: string): ConnectorOperationSpec | undefined {
  return WEBCAL_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export interface ConnectorInvokeContext {
  vault: ConnectorVault;
}

export interface ConnectorInvokeResult {
  operation: string;
  result: unknown;
}

export async function invokeWebcalConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = connectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  const feeds = ctx.vault.getWebcalFeeds();

  switch (operationId) {
    case "getStatus": {
      return {
        operation: operationId,
        result: {
          connected: feeds.length > 0,
          feedCount: feeds.length,
          feeds: feeds.map((feed) => ({ id: feed.id, label: feed.label })),
          provider: "webcal",
        },
      };
    }
    case "listEvents": {
      if (feeds.length === 0) {
        throw new Error("No WebCal feeds configured — add a feed in Settings");
      }
      const timeMin = String(input.timeMin ?? "").trim();
      const timeMax = String(input.timeMax ?? "").trim();
      if (!timeMin || !timeMax) {
        throw new Error("timeMin and timeMax required (ISO 8601)");
      }
      const feedId = String(input.feedId ?? "").trim();
      const selected = feedId ? feeds.filter((feed) => feed.id === feedId) : feeds;
      if (feedId && selected.length === 0) {
        throw new Error(`Unknown feed id "${feedId}"`);
      }
      const events = await queryWebcalEvents(selected, timeMin, timeMax);
      return { operation: operationId, result: { events } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function addWebcalFeedToVault(
  vault: ConnectorVault,
  rawUrl: string,
  label?: string,
): Promise<{ id: string; label: string }> {
  const url = validateWebcalUrl(rawUrl);
  const trimmedLabel = label?.trim() || "Calendar feed";
  const feed = await vault.addWebcalFeed({ label: trimmedLabel, url });
  return { id: feed.id, label: feed.label };
}

export async function removeWebcalFeedFromVault(
  vault: ConnectorVault,
  feedId: string,
): Promise<boolean> {
  return vault.removeWebcalFeed(feedId.trim());
}
