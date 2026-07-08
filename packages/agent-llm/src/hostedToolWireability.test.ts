import { describe, expect, it } from "vitest";
import { filterWireableHostedTools, isWireableHostedToolType } from "./hostedToolWireability.js";
import { formatNativeToolsLabel, normalizeModelCapabilityProfile } from "./modelCapabilities.js";

describe("hostedToolWireability", () => {
  it("excludes file_search without vector stores", () => {
    expect(isWireableHostedToolType("file_search")).toBe(false);
    expect(filterWireableHostedTools(["file_search", "web_search"])).toEqual(["web_search"]);
  });

  it("allows self-wiring tools", () => {
    expect(filterWireableHostedTools(["web_search", "image_generation"])).toEqual([
      "web_search",
      "image_generation",
    ]);
  });
});

describe("normalizeModelCapabilityProfile", () => {
  it("fills missing arrays on legacy stored profiles", () => {
    expect(
      formatNativeToolsLabel({
        nativeTools: ["web_search"],
      } as Parameters<typeof formatNativeToolsLabel>[0]),
    ).toBe("web_search");

    const normalized = normalizeModelCapabilityProfile(
      { nativeTools: ["web_search"], responsesApi: true } as Partial<import("./modelCapabilities.js").ModelCapabilityProfile>,
      { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
    );
    expect(normalized.providerHostedTools).toEqual([]);
    expect(normalized.providerFeatures).toEqual([]);
  });

  it("strips file_search from stale wired tools", () => {
    const normalized = normalizeModelCapabilityProfile(
      {
        providerHostedTools: ["file_search", "web_search"],
        nativeTools: ["web_search", "file_search"],
        responsesApi: true,
      },
      { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
    );
    expect(normalized.providerHostedTools).toEqual(["web_search"]);
  });
});
