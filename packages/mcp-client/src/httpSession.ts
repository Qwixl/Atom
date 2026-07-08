import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpHttpConnectOptions, McpToolDescriptor } from "./types.js";

/** One-shot Streamable HTTP MCP session: connect, use, close. */
export class McpHttpSession {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  async connect(options: McpHttpConnectOptions): Promise<void> {
    const headers = options.headers ?? {};
    this.transport = new StreamableHTTPClientTransport(new URL(options.url), {
      requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
    });
    this.client = new Client(
      {
        name: options.clientName ?? "atom-mcp-client",
        version: options.clientVersion ?? "0.1.0",
      },
      { capabilities: {} },
    );
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    if (!this.client) throw new Error("MCP session not connected");
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error("MCP session not connected");
    return await this.client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.transport = null;
  }
}

export async function withMcpHttpSession<T>(
  options: McpHttpConnectOptions,
  fn: (session: McpHttpSession) => Promise<T>,
): Promise<T> {
  const session = new McpHttpSession();
  try {
    await session.connect(options);
    return await fn(session);
  } finally {
    await session.close();
  }
}
