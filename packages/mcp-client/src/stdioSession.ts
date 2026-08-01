import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  McpStdioConnectOptions,
  McpToolDescriptor,
  McpReadResourceResult,
  McpResourceDescriptor,
} from "./types.js";
import { mapSdkReadResource, mapSdkResource, mapSdkTool } from "./resourceMap.js";

/** One-shot stdio MCP session: connect, use, close. */
export class McpStdioSession {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(options: McpStdioConnectOptions): Promise<void> {
    this.transport = new StdioClientTransport({
      command: options.command,
      args: options.args ?? [],
      cwd: options.cwd,
      env: options.env
        ? Object.fromEntries(
            Object.entries({ ...process.env, ...options.env }).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : undefined,
      stderr: "pipe",
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
    return result.tools.map((tool) => mapSdkTool(tool));
  }

  async listResources(): Promise<McpResourceDescriptor[]> {
    if (!this.client) throw new Error("MCP session not connected");
    const result = await this.client.listResources();
    return result.resources.map((resource) => mapSdkResource(resource));
  }

  async readResource(uri: string): Promise<McpReadResourceResult> {
    if (!this.client) throw new Error("MCP session not connected");
    const result = await this.client.readResource({ uri });
    return mapSdkReadResource(result);
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

/** Run a callback with a connected stdio MCP session. */
export async function withMcpStdioSession<T>(
  options: McpStdioConnectOptions,
  fn: (session: McpStdioSession) => Promise<T>,
): Promise<T> {
  const session = new McpStdioSession();
  try {
    await session.connect(options);
    return await fn(session);
  } finally {
    await session.close();
  }
}
