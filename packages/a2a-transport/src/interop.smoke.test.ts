import { describe, expect, it } from "vitest";
import { buildAtomAgentCard } from "./agentCard.js";
import { ATOM_A2A_EXTENSION } from "./constants.js";

describe("A2A interop smoke (BK-14)", () => {
  it("publishes v1.0 and v0.3 interfaces and the Atom data-object extension", () => {
    const card = buildAtomAgentCard({
      name: "Test agent",
      description: "Interop smoke fixture",
      baseUrl: "https://agent.example.test",
    });
    const jsonRpcUrl = "https://agent.example.test/a2a/jsonrpc";

    // Versions are pinned as literals: this is the wire contract peers see.
    const [preferred] = card.supportedInterfaces;
    expect(preferred?.protocolVersion).toBe("1.0");
    expect(preferred?.protocolBinding).toBe("JSONRPC");
    expect(preferred?.url).toBe(jsonRpcUrl);

    const legacy = card.supportedInterfaces.find((iface) => iface.protocolVersion === "0.3");
    expect(legacy?.protocolBinding).toBe("JSONRPC");
    expect(legacy?.url).toBe(jsonRpcUrl);

    const extensions = card.capabilities?.extensions ?? [];
    expect(extensions.some((ext) => ext.uri === ATOM_A2A_EXTENSION)).toBe(true);
  });
});
