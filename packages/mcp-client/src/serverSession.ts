import type { McpHttpConnectOptions, McpStdioConnectOptions, McpTransportKind } from "./types.js";
import { withMcpHttpSession } from "./httpSession.js";
import { withMcpStdioSession } from "./stdioSession.js";
import type { McpToolDescriptor } from "./types.js";

export interface McpServerConnectOptions {
  transport?: McpTransportKind;
  stdio?: McpStdioConnectOptions;
  http?: McpHttpConnectOptions;
}

export async function withMcpServerSession<T>(
  options: McpServerConnectOptions,
  fn: (session: {
    listTools(): Promise<McpToolDescriptor[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  }) => Promise<T>,
): Promise<T> {
  const transport = options.transport ?? "stdio";
  if (transport === "streamable-http") {
    if (!options.http?.url?.trim()) {
      throw new Error("MCP streamable-http server requires url");
    }
    return withMcpHttpSession(options.http, fn);
  }
  if (!options.stdio?.command?.trim()) {
    throw new Error("MCP stdio server requires command");
  }
  return withMcpStdioSession(options.stdio, fn);
}
