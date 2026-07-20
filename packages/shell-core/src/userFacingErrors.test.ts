import { describe, expect, it } from "vitest";
import { presentChatAgentError } from "./userFacingErrors.js";

describe("presentChatAgentError", () => {
  it("sanitizes AG-UI reachability errors", () => {
    expect(presentChatAgentError(new Error("Could not reach the AG-UI agent: TypeError: Failed to fetch"))).toMatch(
      /Could not reach your agent/i,
    );
  });

  it("sanitizes agent run errors", () => {
    expect(presentChatAgentError(new Error("Agent run error: internal stack"))).toMatch(/hit a problem/i);
  });

  it("falls back to a generic message", () => {
    expect(presentChatAgentError(new Error("weird opaque provider code XYZ"))).toBe(
      "Something went wrong talking to your agent. Try again.",
    );
  });

  it("maps 401 to session reconnect guidance", () => {
    expect(presentChatAgentError(new Error("Unauthorized"))).toMatch(/session expired|sign out/i);
  });
});
