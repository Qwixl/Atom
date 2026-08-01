import { describe, expect, it } from "vitest";
import {
  matchLlmProviderPresetId,
  matchHostedLlmProviderId,
  modelSelectOptions,
  getLlmProviderPreset,
  resolveHostedLlmConnection,
  rankModelsForPicker,
  isHostedLlmProviderId,
} from "./llmProviderPresets.js";

describe("llmProviderPresets", () => {
  it("matches known base URLs", () => {
    expect(matchLlmProviderPresetId("https://api.openai.com/v1")).toBe("openai");
    expect(matchLlmProviderPresetId("https://openrouter.ai/api/v1/")).toBe("openrouter");
    expect(matchLlmProviderPresetId("https://api.anthropic.com")).toBe("anthropic");
    expect(matchLlmProviderPresetId("http://127.0.0.1:11434/v1")).toBe("ollama");
    expect(matchLlmProviderPresetId("https://api.groq.com/openai/v1")).toBe("groq");
    expect(matchLlmProviderPresetId("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(
      "google",
    );
    expect(matchLlmProviderPresetId("https://api.mistral.ai/v1")).toBe("mistral");
    expect(matchLlmProviderPresetId("https://api.deepseek.com/v1")).toBe("deepseek");
    expect(matchLlmProviderPresetId("https://api.together.xyz/v1")).toBe("together");
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

  it("matchHostedLlmProviderId prefers stored provider then URL", () => {
    expect(matchHostedLlmProviderId("https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(matchHostedLlmProviderId("https://api.openai.com/v1", "anthropic")).toBe("anthropic");
    expect(matchHostedLlmProviderId("https://api.groq.com/openai/v1")).toBe("groq");
    expect(isHostedLlmProviderId("google")).toBe(true);
    expect(isHostedLlmProviderId("ollama")).toBe(false);
  });

  it("rankModelsForPicker filters by query and pins suggestions when empty", () => {
    const ranked = rankModelsForPicker({
      presetId: "openrouter",
      apiModels: ["zzz/other", "openai/gpt-4o-mini", "anthropic/claude-sonnet-4"],
      currentModel: "",
      query: "",
    });
    expect(ranked[0]).toBe("openai/gpt-4o-mini");
    const filtered = rankModelsForPicker({
      presetId: "openrouter",
      apiModels: ["zzz/other", "openai/gpt-4o-mini"],
      currentModel: "",
      query: "zzz",
    });
    expect(filtered).toEqual(["zzz/other"]);
  });
});
