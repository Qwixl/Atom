import { describe, expect, it } from "vitest";
import {
  applyProviderMetadataToProfile,
  extractProviderFeatureStrings,
  featureToHostedToolType,
  parseProviderModelMetadata,
} from "./providerModelMetadata.js";
import { inferModelCapabilities } from "./modelCapabilities.js";

describe("providerModelMetadata", () => {
  it("extracts features and capability flags", () => {
    const features = extractProviderFeatureStrings({
      features: ["web_search", "streaming"],
      capabilities: { function_calling: true, image_generation: true },
    });
    expect(features).toContain("web_search");
    expect(features).toContain("streaming");
    expect(features).toContain("function_calling");
    expect(features).toContain("image_generation");
  });

  it("maps known hosted tools from dashboard-style record but skips file_search wiring", () => {
    const parsed = parseProviderModelMetadata(
      {
        features: ["web_search", "file_search", "code_interpreter", "streaming"],
        supported_methods: ["responses", "chat.completions"],
      },
      { model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", family: "chat" },
    );
    expect(parsed?.providerHostedTools).toEqual(
      expect.arrayContaining(["web_search", "code_interpreter"]),
    );
    expect(parsed?.providerHostedTools).not.toContain("file_search");
    expect(parsed?.nativeTools).toContain("file_search");
    expect(parsed?.responsesApi).toBe(true);
    expect(parsed?.source).toBe("provider-metadata");
  });

  it("passes through unknown hosted tool types for forward compat", () => {
    expect(featureToHostedToolType("augmented_reality")).toBe("augmented_reality");
    const parsed = parseProviderModelMetadata(
      {
        features: ["augmented_reality", "web_search"],
        supported_methods: ["responses"],
      },
      { model: "gpt-future", baseUrl: "https://api.openai.com/v1", family: "chat" },
    );
    expect(parsed?.providerHostedTools).toContain("augmented_reality");
    expect(parsed?.providerHostedTools).toContain("web_search");
  });

  it("returns null when record has no features or methods", () => {
    expect(
      parseProviderModelMetadata(
        { id: "gpt-4o-mini", object: "model" },
        { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", family: "chat" },
      ),
    ).toBeNull();
  });

  it("merges metadata into capability profile", () => {
    const base = inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-mini");
    const parsed = parseProviderModelMetadata(
      { features: ["web_search"], supported_methods: ["responses"] },
      { model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", family: "chat" },
    )!;
    const merged = applyProviderMetadataToProfile(base, parsed);
    expect(merged.providerHostedTools).toEqual(["web_search"]);
    expect(merged.source).toBe("provider-metadata");
  });
});
