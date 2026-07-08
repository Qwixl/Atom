import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJsonWithAuthorizationHeader } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const LINEAR_CONNECTOR_ID = "linear";
const LINEAR_API = "https://api.linear.app/graphql";

export const LINEAR_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Linear personal API key is configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listAssignedIssues",
    permission: "read",
    description: "List issues assigned to the token owner (input.limit optional, default 15).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listTeams",
    permission: "read",
    description: "List Linear teams visible to the token owner.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function linearConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return LINEAR_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireLinearApiKey(vault: ConnectorVault): string {
  const stored = vault.getApiToken(LINEAR_CONNECTOR_ID);
  if (!stored?.token) {
    throw new Error("Linear not configured — add a personal API key in Settings → Connectors");
  }
  return stored.token;
}

async function linearGraphql(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = (await fetchJsonWithAuthorizationHeader(LINEAR_API, apiKey, {
    method: "POST",
    body: { query, variables },
  })) as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (Array.isArray(raw.errors) && raw.errors.length > 0) {
    throw new Error(raw.errors[0]?.message ?? "Linear GraphQL request failed");
  }
  return raw.data ?? {};
}

export async function invokeLinearConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = linearConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getApiToken(LINEAR_CONNECTOR_ID);
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.token),
          configuredAt: stored?.configuredAt,
          provider: "linear",
        },
      };
    }
    case "listAssignedIssues": {
      const apiKey = requireLinearApiKey(ctx.vault);
      const limit = Math.min(Math.max(Number(input.limit ?? 15) || 15, 1), 50);
      const data = await linearGraphql(
        apiKey,
        `query AssignedIssues($first: Int!) {
          viewer {
            assignedIssues(first: $first) {
              nodes {
                id
                identifier
                title
                url
                priority
                state { name }
              }
            }
          }
        }`,
        { first: limit },
      );
      const viewer = data.viewer as { assignedIssues?: { nodes?: Array<Record<string, unknown>> } } | undefined;
      const issues = Array.isArray(viewer?.assignedIssues?.nodes)
        ? viewer.assignedIssues.nodes.map((issue) => ({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
            priority: issue.priority,
            state: (issue.state as { name?: string } | undefined)?.name,
          }))
        : [];
      return { operation: operationId, result: { issues } };
    }
    case "listTeams": {
      const apiKey = requireLinearApiKey(ctx.vault);
      const data = await linearGraphql(
        apiKey,
        `query Teams {
          teams {
            nodes {
              id
              name
              key
            }
          }
        }`,
      );
      const teamsRoot = data.teams as { nodes?: Array<Record<string, unknown>> } | undefined;
      const teams = Array.isArray(teamsRoot?.nodes)
        ? teamsRoot.nodes.map((team) => ({
            id: team.id,
            name: team.name,
            key: team.key,
          }))
        : [];
      return { operation: operationId, result: { teams } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
