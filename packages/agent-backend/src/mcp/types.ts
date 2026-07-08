export interface StoredMcpServer {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  /** Empty = all tools from server are permitted until owner tightens. */
  allowedTools: string[];
  enabled: boolean;
  addedAt: number;
}

export interface McpServerPublicView {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  allowedTools: string[];
  enabled: boolean;
  addedAt: number;
}

export function toMcpServerPublicView(server: StoredMcpServer): McpServerPublicView {
  return {
    id: server.id,
    label: server.label,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    allowedTools: server.allowedTools,
    enabled: server.enabled,
    addedAt: server.addedAt,
  };
}
