/**
 * Minimal independent MCP Apps fixture (stdio).
 * No Atom branding — declares one tool with ui:// HTML that posts tools/call.
 *
 * Run: node packages/agent-backend/fixtures/mcp-app-fixture/server.mjs
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const URI = "ui://fixture/demo-view";

const HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Fixture App</title></head>
<body>
  <h1>Fixture MCP App</h1>
  <button id="call">Call show</button>
  <script>
    window.parent.postMessage({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} }, "*");
    document.getElementById("call").onclick = function () {
      window.parent.postMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "show", arguments: { demo: true } }
      }, "*");
    };
  </script>
</body>
</html>`;

const server = new Server(
  { name: "mcp-app-fixture", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "show",
      description: "Open the fixture MCP App view",
      inputSchema: { type: "object", properties: {} },
      _meta: {
        ui: {
          resourceUri: URI,
          visibility: ["model", "app"],
        },
      },
    },
    {
      name: "model-only",
      description: "Model-only tool — View must not call",
      inputSchema: { type: "object", properties: {} },
      _meta: {
        ui: {
          resourceUri: URI,
          visibility: ["model"],
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, tool: name }) }],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: URI,
      name: "Fixture view",
      mimeType: "text/html;profile=mcp-app",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== URI) {
    throw new Error(`Unknown resource: ${request.params.uri}`);
  }
  return {
    contents: [
      {
        uri: URI,
        mimeType: "text/html;profile=mcp-app",
        text: HTML,
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
