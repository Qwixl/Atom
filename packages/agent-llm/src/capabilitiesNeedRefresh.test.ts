import { describe, expect, it } from "vitest";
import { capabilitiesNeedRefresh, inferModelCapabilities } from "./modelCapabilities.js";

describe("capabilitiesNeedRefresh", () => {
  it("returns true for heuristic-only OpenAI profiles", () => {
    const profile = inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-mini");
    expect(
      capabilitiesNeedRefresh(profile, {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
      }),
    ).toBe(true);
  });

  it("returns false for fresh provider-metadata profiles", () => {
    expect(
      capabilitiesNeedRefresh(
        {
          ...inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-mini", "provider-metadata"),
          providerHostedTools: ["web_search"],
          providerFeatures: ["web_search"],
          source: "provider-metadata",
        },
        { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
      ),
    ).toBe(false);
  });
});
