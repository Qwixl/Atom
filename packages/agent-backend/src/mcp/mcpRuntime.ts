import { isMcpToolAllowed, withMcpServerSession, type McpToolDescriptor } from "@qwixl/mcp-client";
import { resolveMcpTransport, isMcpServerTrusted, type StoredMcpServer } from "./types.js";

function sessionOptions(server: StoredMcpServer) {
  const transport = resolveMcpTransport(server);
  return {
    transport,
    stdio:
      transport === "stdio"
        ? {
            command: server.command ?? "",
            args: server.args,
            cwd: server.cwd,
            clientName: "atom-agent-backend",
            clientVersion: "0.1.0",
          }
        : undefined,
    http:
      transport === "streamable-http"
        ? {
            url: server.url ?? "",
            headers: server.headers,
            clientName: "atom-agent-backend",
            clientVersion: "0.1.0",
          }
        : undefined,
  };
}

export class McpRuntime {
  async listTools(server: StoredMcpServer): Promise<McpToolDescriptor[]> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    return withMcpServerSession(sessionOptions(server), (session) => session.listTools());
  }

  async callTool(
    server: StoredMcpServer,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    if (!isMcpServerTrusted(server)) {
      throw new Error(`MCP server not trusted — approve it in Settings → Connectors → MCP: ${server.id}`);
    }
    const name = toolName.trim();
    if (!isMcpToolAllowed(name, server.allowedTools)) {
      throw new Error(`Tool not allowlisted on server ${server.id}: ${name}`);
    }
    return withMcpServerSession(sessionOptions(server), (session) => session.callTool(name, args));
  }
}
