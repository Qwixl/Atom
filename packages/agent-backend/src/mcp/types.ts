import type { McpTransportKind } from "@qwixl/mcp-client";

export interface StoredMcpServer {
  id: string;
  label: string;
  transport?: McpTransportKind;
  /** stdio spawn command — required when transport is stdio (default). */
  command?: string;
  args: string[];
  cwd?: string;
  /** Streamable HTTP endpoint — required when transport is streamable-http. */
  url?: string;
  /** Optional HTTP headers (e.g. Authorization). Agent-local only. */
  headers?: Record<string, string>;
  /** Empty = all tools from server are permitted until owner tightens. */
  allowedTools: string[];
  enabled: boolean;
  addedAt: number;
}

export interface McpServerPublicView {
  id: string;
  label: string;
  transport: McpTransportKind;
  command?: string;
  args: string[];
  cwd?: string;
  url?: string;
  hasAuthHeaders: boolean;
  allowedTools: string[];
  enabled: boolean;
  addedAt: number;
}

export function resolveMcpTransport(server: StoredMcpServer): McpTransportKind {
  return server.transport ?? (server.url?.trim() ? "streamable-http" : "stdio");
}

export function toMcpServerPublicView(server: StoredMcpServer): McpServerPublicView {
  const transport = resolveMcpTransport(server);
  return {
    id: server.id,
    label: server.label,
    transport,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    url: server.url,
    hasAuthHeaders: Boolean(server.headers && Object.keys(server.headers).length > 0),
    allowedTools: server.allowedTools,
    enabled: server.enabled,
    addedAt: server.addedAt,
  };
}
