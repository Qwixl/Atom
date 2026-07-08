import { describe, expect, it } from "vitest";
import { buildAtomAgentCard } from "./agentCard.js";
import { ATOM_A2A_EXTENSION } from "./constants.js";

describe("A2A interop smoke (BK-14)", () => {
  it("publishes Atom data-object extension on agent card", () => {
    const card = buildAtomAgentCard({
      name: "Test agent",
      description: "Interop smoke fixture",
      baseUrl: "https://agent.example.test",
    });
    expect(card.protocolVersion).toBe("0.3.0");
    expect(card.url).toBe("https://agent.example.test/a2a/jsonrpc");
    const extensions = card.capabilities?.extensions ?? [];
    expect(extensions.some((ext) => ext.uri === ATOM_A2A_EXTENSION)).toBe(true);
  });
});
