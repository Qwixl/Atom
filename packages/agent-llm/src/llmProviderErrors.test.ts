import { describe, expect, it } from "vitest";
import { formatLlmProviderError, isResponsesApiFallbackEligible } from "./llmProviderErrors.js";

describe("llmProviderErrors", () => {
  it("detects org verification Responses failures", () => {
    expect(
      isResponsesApiFallbackEligible(
        new Error('Responses API 403 — { "error": { "message": "Verify Organization" } }'),
      ),
    ).toBe(true);
  });

  it("formats org verification guidance", () => {
    expect(
      formatLlmProviderError(new Error("Responses API 403 — Verify Organization required")),
    ).toContain("organization must be verified");
  });
});
