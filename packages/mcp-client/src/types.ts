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
}
