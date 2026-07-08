import { describe, expect, it } from "vitest";
import { estimateLlmCostMinor } from "./llmSpendMeter.js";

describe("llmSpendMeter", () => {
  it("estimates at least 1 minor unit for small usage", () => {
    expect(estimateLlmCostMinor({ promptTokens: 10, completionTokens: 10 })).toBeGreaterThanOrEqual(1);
  });

  it("scales with token counts", () => {
    const small = estimateLlmCostMinor({ promptTokens: 1000, completionTokens: 1000 });
    const large = estimateLlmCostMinor({ promptTokens: 100_000, completionTokens: 100_000 });
    expect(large).toBeGreaterThan(small);
  });
});
