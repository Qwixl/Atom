import { describe, expect, it } from "vitest";
import { McpRuntime } from "./mcpRuntime.js";
import type { StoredMcpServer } from "./types.js";

const baseServer: StoredMcpServer = {
  id: "demo",
  label: "Demo",
  command: "node",
  args: [],
  allowedTools: [],
  enabled: true,
  addedAt: 1,
};

describe("McpRuntime trust gate", () => {
  const runtime = new McpRuntime();

  it("rejects tool calls on untrusted servers", async () => {
    await expect(
      runtime.callTool({ ...baseServer, trusted: false }, "search", {}),
    ).rejects.toThrow(/not trusted/i);
  });
});
