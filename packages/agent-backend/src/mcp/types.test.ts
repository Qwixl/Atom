import { describe, expect, it } from "vitest";
import { isMcpServerTrusted, toMcpServerPublicView } from "./types.js";

describe("MCP trust helpers", () => {
  it("treats legacy servers without trusted flag as trusted", () => {
    expect(isMcpServerTrusted({ trusted: undefined } as never)).toBe(true);
  });

  it("blocks explicitly untrusted servers", () => {
    expect(isMcpServerTrusted({ trusted: false } as never)).toBe(false);
  });

  it("surfaces trusted flag in public view", () => {
    const view = toMcpServerPublicView({
      id: "x",
      label: "X",
      command: "node",
      args: [],
      allowedTools: [],
      enabled: true,
      trusted: false,
      addedAt: 1,
    });
    expect(view.trusted).toBe(false);
  });
});
