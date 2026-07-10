import { describe, expect, it } from "vitest";
import { loadVoiceBackend, StubVoiceBackend } from "./stubVoiceBackend.js";

describe("StubVoiceBackend", () => {
  it("reports stub status", () => {
    const status = new StubVoiceBackend().status();
    expect(status.provider).toBe("stub");
    expect(status.configured).toBe(true);
    expect(status.duplex).toBe("none");
  });

  it("echoes text without audio", async () => {
    const result = await new StubVoiceBackend().synthesize({ text: " Hello " });
    expect(result.textEcho).toBe("Hello");
    expect(result.audioBase64).toBeNull();
  });
});

describe("loadVoiceBackend", () => {
  it("defaults to stub without API key", () => {
    expect(loadVoiceBackend({}).id).toBe("stub");
  });

  it("selects openai-realtime when API key present", () => {
    const backend = loadVoiceBackend({ LLM_API_KEY: "sk-test" });
    expect(backend.id).toBe("openai-realtime");
    expect(backend.status().configured).toBe(true);
    expect(backend.status().duplex).toBe("half");
  });

  it("returns placeholder for unimplemented providers", () => {
    const backend = loadVoiceBackend({ ATOM_VOICE_PROVIDER: "elevenlabs" });
    expect(backend.id).toBe("elevenlabs");
    expect(backend.status().configured).toBe(false);
  });
});
