import { describe, expect, it } from "vitest";
import { loadElevenLabsConvAiConfig } from "./elevenLabsConvAi.js";

describe("loadElevenLabsConvAiConfig", () => {
  it("returns null without key or agent id", () => {
    expect(loadElevenLabsConvAiConfig({})).toBeNull();
    expect(loadElevenLabsConvAiConfig({ ELEVENLABS_API_KEY: "k" })).toBeNull();
    expect(loadElevenLabsConvAiConfig({ ELEVENLABS_AGENT_ID: "agent_x" })).toBeNull();
  });

  it("loads from ELEVENLABS_* env", () => {
    const cfg = loadElevenLabsConvAiConfig({
      ELEVENLABS_API_KEY: "sk_test",
      ELEVENLABS_AGENT_ID: "agent_abc",
    });
    expect(cfg).toEqual({
      apiKey: "sk_test",
      agentId: "agent_abc",
      apiBaseUrl: "https://api.elevenlabs.io",
    });
  });

  it("accepts platform env aliases", () => {
    const cfg = loadElevenLabsConvAiConfig({
      ATOM_PLATFORM_ELEVENLABS_KEY: "sk_plat",
      ATOM_PLATFORM_ELEVENLABS_AGENT_ID: "agent_plat",
    });
    expect(cfg?.apiKey).toBe("sk_plat");
    expect(cfg?.agentId).toBe("agent_plat");
  });
});
