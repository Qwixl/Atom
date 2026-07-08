import { describe, expect, it } from "vitest";
import { buildAgentToolProfile, chatCompletionTools } from "./agentTools.js";
import { parseAtomMcpInvokeArgs } from "./mcpTools.js";

describe("MCP tool profile", () => {
  it("includes atom_mcp_invoke when MCP servers are available", () => {
    const profile = buildAgentToolProfile(undefined, { mcpServersAvailable: true });
    expect(profile.atom).toContain("mcp_invoke");
    const tools = chatCompletionTools(profile) as Array<{ function?: { name?: string } }>;
    expect(tools.some((tool) => tool.function?.name === "atom_mcp_invoke")).toBe(true);
  });

  it("parses atom_mcp_invoke args", () => {
    expect(
      parseAtomMcpInvokeArgs(
        JSON.stringify({ serverId: "fs", toolName: "search", arguments: { q: "atom" } }),
      ),
    ).toEqual({ serverId: "fs", toolName: "search", arguments: { q: "atom" } });
  });
});
