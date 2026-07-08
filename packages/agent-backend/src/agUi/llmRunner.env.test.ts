import { describe, expect, it } from "vitest";
import { loadLlmAgUiConfigFromEnv } from "./llmRunner.js";

describe("loadLlmAgUiConfigFromEnv (M-TS-06)", () => {
  it("returns null without an API key", () => {
    expect(loadLlmAgUiConfigFromEnv({})).toBeNull();
  });

  it("parses safety prefix and model allowlist", () => {
    const config = loadLlmAgUiConfigFromEnv({
      LLM_API_KEY: "sk-test",
      LLM_MODEL: "gpt-4o-mini",
      ATOM_SAFETY_PREFIX: "Stay within catalog composition.",
      ATOM_MODEL_ALLOWLIST: "gpt-4o-mini, gpt-4o",
    });
    expect(config?.safetyPrefix).toBe("Stay within catalog composition.");
    expect(config?.modelAllowlist).toEqual(["gpt-4o-mini", "gpt-4o"]);
    expect(config?.model).toBe("gpt-4o-mini");
  });
});
