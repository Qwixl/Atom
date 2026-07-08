import { describe, expect, it } from "vitest";
import { splitAnthropicMessages, parseAnthropicResponse, openAiToolsToAnthropic } from "./anthropicMessages.js";
import { ATOM_CONNECTOR_INVOKE_TOOL } from "./agentTools.js";

describe("anthropicMessages", () => {
  it("splits system from chat messages", () => {
    const split = splitAnthropicMessages([
      { role: "system", content: "You are Atom." },
      { role: "user", content: "Hello" },
    ]);
    expect(split.system).toContain("You are Atom");
    expect(split.messages).toHaveLength(1);
  });

  it("parses tool use blocks", () => {
    const parsed = parseAnthropicResponse({
      content: [
        { type: "tool_use", id: "tu_1", name: "atom_connector_invoke", input: { connectorId: "rss" } },
      ],
    });
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]?.name).toBe("atom_connector_invoke");
  });

  it("converts OpenAI tools to Anthropic schema", () => {
    const tools = openAiToolsToAnthropic([ATOM_CONNECTOR_INVOKE_TOOL]);
    expect(tools[0]?.name).toBe("atom_connector_invoke");
  });
});
