import type { McpTransportKind } from "@qwixl/mcp-client";

export interface BrainConfig {
  transport: McpTransportKind;
  command?: string;
  args: string[];
  url?: string;
  headers?: Record<string, string>;
  toolName: string;
}

export function loadBrainConfig(): BrainConfig {
  const transportRaw = (process.env.MCP_BRAIN_TRANSPORT ?? "stdio").trim().toLowerCase();
  const transport: McpTransportKind =
    transportRaw === "streamable-http" || transportRaw === "http" ? "streamable-http" : "stdio";
  const toolName = (process.env.MCP_BRAIN_TOOL ?? "chat").trim() || "chat";
  const authHeader = (process.env.MCP_BRAIN_AUTH_HEADER ?? "").trim();

  if (transport === "streamable-http") {
    const url = (process.env.MCP_BRAIN_URL ?? "").trim();
    if (!url) {
      throw new Error("MCP_BRAIN_URL is required when MCP_BRAIN_TRANSPORT=streamable-http");
    }
    return {
      transport,
      url,
      args: [],
      headers: authHeader ? { Authorization: authHeader } : undefined,
      toolName,
    };
  }

  const command = (process.env.MCP_BRAIN_COMMAND ?? "").trim();
  if (!command) {
    throw new Error("MCP_BRAIN_COMMAND is required when MCP_BRAIN_TRANSPORT=stdio");
  }
  const args = (process.env.MCP_BRAIN_ARGS ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return { transport, command, args, toolName };
}
