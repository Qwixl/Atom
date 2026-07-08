import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const HOME_ASSISTANT_CONNECTOR_ID = "home-assistant";

export const HOME_ASSISTANT_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Home Assistant base URL and long-lived token are configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listEntities",
    permission: "read",
    description: "List entity states (optional input.domain prefix filter, e.g. light).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "getEntity",
    permission: "read",
    description: "Fetch one entity state (input.entityId required).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function homeAssistantConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return HOME_ASSISTANT_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export function normalizeHomeAssistantBaseUrl(raw: string): string {
  return validateConnectorHttpsUrl(raw.trim()).replace(/\/+$/, "");
}

function requireHomeAssistant(vault: ConnectorVault): { baseUrl: string; accessToken: string } {
  const stored = vault.getHomeAssistantInstance();
  if (!stored?.baseUrl || !stored.accessToken) {
    throw new Error("Home Assistant not configured — add base URL and token in Settings → Connectors");
  }
  return { baseUrl: stored.baseUrl, accessToken: stored.accessToken };
}

function summarizeEntity(entity: Record<string, unknown>) {
  const attributes = entity.attributes as Record<string, unknown> | undefined;
  return {
    entityId: entity.entity_id,
    state: entity.state,
    friendlyName: attributes?.friendly_name,
    lastChanged: entity.last_changed,
    lastUpdated: entity.last_updated,
  };
}

export async function invokeHomeAssistantConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = homeAssistantConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getHomeAssistantInstance();
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.baseUrl && stored.accessToken),
          configuredAt: stored?.configuredAt,
          provider: "home-assistant",
        },
      };
    }
    case "listEntities": {
      const { baseUrl, accessToken } = requireHomeAssistant(ctx.vault);
      const domain = String(input.domain ?? "").trim().toLowerCase();
      const raw = (await fetchJsonWithBearerToken(`${baseUrl}/api/states`, accessToken)) as Array<
        Record<string, unknown>
      >;
      const entities = Array.isArray(raw)
        ? raw
            .filter((entity) => {
              const entityId = String(entity.entity_id ?? "");
              return !domain || entityId.startsWith(`${domain}.`);
            })
            .map(summarizeEntity)
        : [];
      return { operation: operationId, result: { domain: domain || undefined, entities } };
    }
    case "getEntity": {
      const entityId = String(input.entityId ?? "").trim();
      if (!entityId) {
        throw new Error("entityId required");
      }
      const { baseUrl, accessToken } = requireHomeAssistant(ctx.vault);
      const raw = (await fetchJsonWithBearerToken(
        `${baseUrl}/api/states/${encodeURIComponent(entityId)}`,
        accessToken,
      )) as Record<string, unknown>;
      return { operation: operationId, result: { entity: summarizeEntity(raw) } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
