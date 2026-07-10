import { describe, expect, it } from "vitest";
import { formatAgentError, presentUserError } from "./agentErrors.js";

describe("presentUserError", () => {
  it("maps missing LLM key to Settings → Agent guidance", () => {
    const msg = presentUserError(
      new Error("AG-UI LLM not configured. Set LLM_API_KEY (or OPENAI_API_KEY) on the agent backend"),
    );
    expect(msg).toMatch(/Settings → Agent/i);
    expect(msg).not.toMatch(/LLM_API_KEY|pnpm/);
  });

  it("maps network failures to a reachability message", () => {
    expect(presentUserError(new Error("Failed to fetch"))).toMatch(/Could not reach your agent/i);
  });

  it("does not pass through short technical blobs", () => {
    const msg = presentUserError(new Error('{"error":{"message":"rate_limit_exceeded","type":"api"}}'));
    expect(msg).toBe("Something went wrong. Try again.");
  });

  it("appends technical details for developer accounts", () => {
    const raw = "ECONNREFUSED 127.0.0.1:5311";
    const msg = presentUserError(new Error(raw), { accountType: "developer" });
    expect(msg).toMatch(/Technical details:/);
    expect(msg).toContain(raw);
  });

  it("keeps user accounts on friendly copy only", () => {
    const raw = "ECONNREFUSED 127.0.0.1:5311";
    const msg = presentUserError(new Error(raw), { accountType: "user" });
    expect(msg).not.toContain(raw);
    expect(msg).not.toMatch(/Technical details/);
  });

  it("formatAgentError stays sanitized", () => {
    expect(formatAgentError(new Error("Request failed (503)"))).toMatch(/not responding|Could not reach/i);
  });
});
