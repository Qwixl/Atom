import type { VoiceBackend, VoiceBackendStatus, VoiceSynthesisRequest, VoiceSynthesisResult } from "./types.js";

/** No-op voice provider — documents the seam until a realtime provider is selected (Q32d). */
export class StubVoiceBackend implements VoiceBackend {
  readonly id = "stub" as const;

  status(): VoiceBackendStatus {
    return {
      provider: "stub",
      configured: true,
      duplex: "none",
      message:
        "Voice seam is stubbed. Set ATOM_VOICE_PROVIDER=openai-realtime or elevenlabs when a provider is wired (BK-46).",
    };
  }

  async synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
    const text = request.text.trim();
    return {
      audioBase64: null,
      mimeType: null,
      textEcho: text,
    };
  }
}

export function loadVoiceBackend(env: NodeJS.ProcessEnv = process.env): VoiceBackend {
  const provider = env.ATOM_VOICE_PROVIDER?.trim().toLowerCase();
  if (provider === "openai-realtime" || provider === "elevenlabs") {
    // Providers not implemented yet — fall through to stub with a configured=false status wrapper.
    return {
      id: provider,
      status: () => ({
        provider,
        configured: false,
        duplex: "none",
        message: `Provider "${provider}" selected but not implemented yet (Q32d). Using stub behavior.`,
      }),
      synthesize: async (request) => new StubVoiceBackend().synthesize(request),
    };
  }
  return new StubVoiceBackend();
}
