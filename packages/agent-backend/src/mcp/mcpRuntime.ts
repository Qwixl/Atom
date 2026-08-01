import {
  isMcpToolAllowed,
  uiResourceUriFromToolMeta,
  withMcpServerSession,
  type McpToolDescriptor,
} from "@qwixl/mcp-client";
import { resolveMcpTransport, isMcpServerTrusted, type StoredMcpServer } from "./types.js";
import { mcpAppsToolToRegistryRef, type McpAppsToolDescriptor } from "../mcpAppsAdapter.js";
import {
  assertMcpAppAllowlistForUi,
  assertMcpAppHtmlMime,
  assertMcpAppHtmlSize,
  assertUriPinned,
  buildMcpAppCsp,
  buildUiUriPinSet,
  wrapHtmlWithCsp,
} from "./mcpAppPolicy.js";

export { mcpAppsToolToRegistryRef };

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

export interface McpUiResourceReadResult {
  serverId: string;
  uri: string;
  mimeType: string;
  html: string;
  htmlWithCsp: string;
  csp: string;
  contentHash: string;
  pinnedUris: string[];
}

export class McpRuntime {
  /** Per-server snapshot of declared ui:// URIs (D131 §14.2). */
  #uiUriPins = new Map<string, Set<string>>();

  async listTools(server: StoredMcpServer): Promise<McpToolDescriptor[]> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    const tools = await withMcpServerSession(sessionOptions(server), (session) =>
      session.listTools(),
    );
    await this.refreshUiUriPin(server, tools);
    return tools;
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

  /**
   * Fetch and validate an MCP Apps ui:// HTML resource for host rendering.
   */
  async readUiResource(
    server: StoredMcpServer,
    uri: string,
  ): Promise<McpUiResourceReadResult> {
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    if (!isMcpServerTrusted(server)) {
      throw new Error(`MCP server not trusted — approve it in Settings → Connectors → MCP: ${server.id}`);
    }
    assertMcpAppAllowlistForUi(server.allowedTools);

    const tools = await this.listTools(server);
    const pin =
      this.#uiUriPins.get(server.id) ??
      buildUiUriPinSet({
        toolUiUris: tools.map((tool) => uiResourceUriFromToolMeta(tool.meta) ?? "").filter(Boolean),
      });
    assertUriPinned(uri, pin);

    const read = await withMcpServerSession(sessionOptions(server), (session) =>
      session.readResource(uri.trim()),
    );
    const content = read.contents[0];
    if (!content) throw new Error(`MCP resources/read returned no contents for ${uri}`);
    assertMcpAppHtmlMime(content.mimeType);
    let html = content.text ?? "";
    if (!html && content.blob) {
      html = Buffer.from(content.blob, "base64").toString("utf8");
    }
    if (!html.trim()) throw new Error(`MCP App resource has empty HTML: ${uri}`);
    assertMcpAppHtmlSize(html);

    const csp = buildMcpAppCsp(undefined, { allowUnsafeInline: true });
    const htmlWithCsp = wrapHtmlWithCsp(html, csp);
    const { createHash } = await import("node:crypto");
    const contentHash = createHash("sha256").update(html, "utf8").digest("hex");

    return {
      serverId: server.id,
      uri: uri.trim(),
      mimeType: content.mimeType ?? "text/html",
      html,
      htmlWithCsp,
      csp,
      contentHash,
      pinnedUris: [...pin].sort(),
    };
  }

  getUiUriPin(serverId: string): string[] {
    return [...(this.#uiUriPins.get(serverId) ?? [])].sort();
  }

  private async refreshUiUriPin(
    server: StoredMcpServer,
    tools: McpToolDescriptor[],
  ): Promise<void> {
    let resourceUris: string[] = [];
    try {
      const resources = await withMcpServerSession(sessionOptions(server), (session) =>
        session.listResources(),
      );
      resourceUris = resources.map((resource) => resource.uri);
    } catch {
      // Servers without resources capability still pin from tool metadata.
    }
    const pin = buildUiUriPinSet({
      toolUiUris: tools
        .map((tool) => uiResourceUriFromToolMeta(tool.meta) ?? "")
        .filter(Boolean),
      resourceUris,
    });
    this.#uiUriPins.set(server.id, pin);
  }
}
