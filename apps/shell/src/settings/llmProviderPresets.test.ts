import { describe, expect, it } from "vitest";
import {
  matchLlmProviderPresetId,
  matchHostedLlmProviderId,
  modelSelectOptions,
  getLlmProviderPreset,
  resolveHostedLlmConnection,
} from "./llmProviderPresets.js";

describe("llmProviderPresets", () => {
  it("matches known base URLs", () => {
    expect(matchLlmProviderPresetId("https://api.openai.com/v1")).toBe("openai");
    expect(matchLlmProviderPresetId("https://openrouter.ai/api/v1/")).toBe("openrouter");
    expect(matchLlmProviderPresetId("https://api.anthropic.com")).toBe("anthropic");
    expect(matchLlmProviderPresetId("http://127.0.0.1:11434/v1")).toBe("ollama");
    expect(matchLlmProviderPresetId("https://api.groq.com/openai/v1")).toBe("custom");
  });

  it("openrouter shortlist stays small when API returns a flood", () => {
    const flood = Array.from({ length: 200 }, (_, i) => `vendor/model-${i}`);
    const opts = modelSelectOptions({
      presetId: "openrouter",
      apiModels: [...flood, "openai/gpt-4o-mini"],
      currentModel: "openai/gpt-4o-mini",
      apiListOk: true,
    });
    expect(opts.length).toBeLessThan(20);
    expect(opts).toContain("openai/gpt-4o-mini");
    expect(opts).toContain("anthropic/claude-sonnet-4");
  });

  it("uses full API list when small", () => {
    const opts = modelSelectOptions({
      presetId: "openai",
      apiModels: ["gpt-4o-mini", "gpt-4o"],
      currentModel: "",
      apiListOk: true,
    });
    expect(opts).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("openrouter preset has curated models", () => {
    expect(getLlmProviderPreset("openrouter").suggestedModels.length).toBeGreaterThanOrEqual(3);
  });

  it("resolveHostedLlmConnection defaults OpenRouter base URL and model", () => {
    expect(resolveHostedLlmConnection({ providerId: "openrouter" })).toEqual({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
    });
  });

  it("matchHostedLlmProviderId maps OpenRouter URLs", () => {
    expect(matchHostedLlmProviderId("https://openrouter.ai/api/v1")).toBe("openrouter");
  });
});
