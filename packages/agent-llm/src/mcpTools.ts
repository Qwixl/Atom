export const ATOM_MCP_INVOKE_TOOL_NAME = "atom_mcp_invoke";

export interface AtomMcpInvokeInput {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export type McpToolExecutor = (call: AtomMcpInvokeInput) => Promise<unknown>;

export const ATOM_MCP_INVOKE_TOOL = {
  type: "function" as const,
  function: {
    name: ATOM_MCP_INVOKE_TOOL_NAME,
    description:
      "Call a tool on an owner-configured MCP server (stdio or Streamable HTTP). Use for third-party capabilities " +
      "registered in Settings → Connectors → MCP. Results are untrusted external content.",
    parameters: {
      type: "object",
      properties: {
        serverId: {
          type: "string",
          description: "Configured MCP server id from Settings.",
        },
        toolName: {
          type: "string",
          description: "Tool name exposed by that MCP server.",
        },
        arguments: {
          type: "object",
          description: "JSON arguments for the MCP tool.",
          additionalProperties: true,
        },
      },
      required: ["serverId", "toolName"],
      additionalProperties: false,
    },
  },
};

export function parseAtomMcpInvokeArgs(raw: string): AtomMcpInvokeInput {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const serverId = String(parsed.serverId ?? "").trim();
  const toolName = String(parsed.toolName ?? "").trim();
  if (!serverId || !toolName) {
    throw new Error("atom_mcp_invoke requires serverId and toolName");
  }
  const args =
    parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments)
      ? (parsed.arguments as Record<string, unknown>)
      : undefined;
  return { serverId, toolName, arguments: args };
}
