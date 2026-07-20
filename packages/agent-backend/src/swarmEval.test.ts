import { describe, expect, it } from "vitest";
import { runSwarmEvalSuite, swarmEvalAllPassed } from "./swarmEval.js";

describe("swarmEval", () => {
  it("passes the AS-12 suite", () => {
    const results = runSwarmEvalSuite();
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(swarmEvalAllPassed(results)).toBe(true);
  });
});
