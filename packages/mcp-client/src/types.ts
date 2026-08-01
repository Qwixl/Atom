export type McpTransportKind = "stdio" | "streamable-http";

export interface McpStdioConnectOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
}

export interface McpHttpConnectOptions {
  url: string;
  headers?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
  /** Passthrough MCP tool `_meta` (e.g. `_meta.ui.resourceUri`). */
  meta?: Record<string, unknown>;
}

export interface McpResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpReadResourceResult {
  contents: McpResourceContents[];
}

export interface McpResourceDescriptor {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}
