import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchJsonWithBearerToken } from "./tokenConnectorHttp.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const TODOIST_CONNECTOR_ID = "todoist";
const TODOIST_API = "https://api.todoist.com/rest/v2";

export const TODOIST_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return whether a Todoist personal API token is configured.",
    cacheTtlMs: 0,
  },
  {
    id: "listTasks",
    permission: "read",
    description: "List tasks (input.filter: today | overdue | all; default today).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listProjects",
    permission: "read",
    description: "List Todoist projects.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function todoistConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return TODOIST_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireTodoistToken(vault: ConnectorVault): string {
  const stored = vault.getApiToken(TODOIST_CONNECTOR_ID);
  if (!stored?.token) {
    throw new Error("Todoist not configured — add a personal API token in Settings → Connectors");
  }
  return stored.token;
}

function summarizeTask(task: Record<string, unknown>) {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    priority: task.priority,
    due: task.due,
    projectId: task.project_id,
    url: task.url,
  };
}

export async function invokeTodoistConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = todoistConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const stored = ctx.vault.getApiToken(TODOIST_CONNECTOR_ID);
      return {
        operation: operationId,
        result: {
          connected: Boolean(stored?.token),
          configuredAt: stored?.configuredAt,
          provider: "todoist",
        },
      };
    }
    case "listTasks": {
      const token = requireTodoistToken(ctx.vault);
      const filter = String(input.filter ?? "today").trim() || "today";
      const allowed = new Set(["today", "overdue", "all"]);
      const queryFilter = allowed.has(filter) ? filter : "today";
      const url =
        queryFilter === "all"
          ? `${TODOIST_API}/tasks`
          : `${TODOIST_API}/tasks?filter=${encodeURIComponent(queryFilter)}`;
      const raw = (await fetchJsonWithBearerToken(url, token)) as Array<Record<string, unknown>>;
      const tasks = Array.isArray(raw) ? raw.map(summarizeTask) : [];
      return { operation: operationId, result: { filter: queryFilter, tasks } };
    }
    case "listProjects": {
      const token = requireTodoistToken(ctx.vault);
      const raw = (await fetchJsonWithBearerToken(`${TODOIST_API}/projects`, token)) as Array<
        Record<string, unknown>
      >;
      const projects = Array.isArray(raw)
        ? raw.map((project) => ({
            id: project.id,
            name: project.name,
            color: project.color,
            isFavorite: project.is_favorite,
          }))
        : [];
      return { operation: operationId, result: { projects } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function createTodoistTask(
  vault: ConnectorVault,
  input: { content: string; projectId?: string; dueString?: string },
): Promise<{ id: string; content: string }> {
  const token = requireTodoistToken(vault);
  const content = input.content.trim();
  if (!content) {
    throw new Error("content required");
  }
  const body: Record<string, unknown> = { content };
  if (input.projectId?.trim()) body.project_id = input.projectId.trim();
  if (input.dueString?.trim()) body.due_string = input.dueString.trim();
  const created = (await fetchJsonWithBearerToken(`${TODOIST_API}/tasks`, token, {
    method: "POST",
    body,
  })) as Record<string, unknown>;
  return {
    id: String(created.id ?? ""),
    content: String(created.content ?? content),
  };
}
