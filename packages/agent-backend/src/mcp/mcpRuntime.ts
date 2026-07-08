import { isMcpToolAllowed, withMcpStdioSession, type McpToolDescriptor } from "@qwixl/mcp-client";
import type { StoredMcpServer } from "./types.js";

export class McpRuntime {
  async listTools(server: StoredMcpServer): Promise<McpToolDescriptor[]> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    return withMcpStdioSession(
      {
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        clientName: "atom-agent-backend",
        clientVersion: "0.1.0",
      },
      (session) => session.listTools(),
    );
  }

  async callTool(
    server: StoredMcpServer,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    const name = toolName.trim();
    if (!isMcpToolAllowed(name, server.allowedTools)) {
      throw new Error(`Tool not allowlisted on server ${server.id}: ${name}`);
    }
    return withMcpStdioSession(
      {
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        clientName: "atom-agent-backend",
        clientVersion: "0.1.0",
      },
      (session) => session.callTool(name, args),
    );
  }
}
