import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";
import {
  getMicrosoftAccessToken,
  MICROSOFT_GRAPH_CONNECTOR_ID,
  MICROSOFT_OAUTH_PROVIDER,
  microsoftGraphApiBase,
  resolveMicrosoftClient,
} from "./microsoftOAuth.js";

export { MICROSOFT_GRAPH_CONNECTOR_ID };

export const MICROSOFT_GRAPH_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether Microsoft Graph OAuth is connected (no token material).",
    cacheTtlMs: 0,
  },
  {
    id: "listEvents",
    permission: "read",
    description:
      "List calendar events between timeMin and timeMax (ISO 8601). Defaults to today through +14 days.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function microsoftGraphConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return MICROSOFT_GRAPH_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function defaultTimeRange(input: Record<string, unknown>): { timeMin: string; timeMax: string } {
  const now = new Date();
  const timeMin =
    String(input.timeMin ?? "").trim() ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax =
    String(input.timeMax ?? "").trim() ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();
  return { timeMin, timeMax };
}

function summarizeEvent(event: Record<string, unknown>) {
  const start = event.start as { dateTime?: string; date?: string } | undefined;
  const end = event.end as { dateTime?: string; date?: string } | undefined;
  return {
    id: event.id,
    subject: event.subject,
    start: start?.dateTime ?? start?.date,
    end: end?.dateTime ?? end?.date,
    isAllDay: event.isAllDay === true,
    webLink: event.webLink,
    location:
      typeof event.location === "object" && event.location && "displayName" in event.location
        ? String((event.location as { displayName?: string }).displayName ?? "")
        : undefined,
  };
}

export async function invokeMicrosoftGraphConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = microsoftGraphConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const tokens = ctx.vault.getOAuth(MICROSOFT_OAUTH_PROVIDER);
      let clientConfigured = false;
      try {
        resolveMicrosoftClient(ctx.vault);
        clientConfigured = true;
      } catch {
        clientConfigured = false;
      }
      return {
        operation: operationId,
        result: {
          connected: Boolean(tokens?.accessToken),
          clientConfigured,
          provider: "microsoft",
          connectorId: MICROSOFT_GRAPH_CONNECTOR_ID,
          scopes: tokens?.scope,
          expiresAt: tokens?.expiresAt,
        },
      };
    }
    case "listEvents": {
      const accessToken = await getMicrosoftAccessToken(ctx.vault);
      const { timeMin, timeMax } = defaultTimeRange(input);
      const params = new URLSearchParams({
        startDateTime: timeMin,
        endDateTime: timeMax,
        $orderby: "start/dateTime",
        $top: String(Math.min(Math.max(Number(input.limit ?? 50) || 50, 1), 100)),
      });
      const raw = (await fetchJsonWithBearerToken(
        `${microsoftGraphApiBase()}/me/calendarView?${params}`,
        accessToken,
      )) as { value?: Array<Record<string, unknown>> };
      const events = Array.isArray(raw.value) ? raw.value.map(summarizeEvent) : [];
      return { operation: operationId, result: { events, timeMin, timeMax } };
    }
    default:
      throw new Error(`Unsupported Microsoft Graph operation "${operationId}"`);
  }
}

export function isMicrosoftGraphConfigured(vault: ConnectorVault): boolean {
  return Boolean(vault.getOAuth(MICROSOFT_OAUTH_PROVIDER)?.accessToken);
}
