import { OpenAiRealtimeVoiceBackend } from "./openaiRealtimeVoiceBackend.js";
import type {
  VoiceBackend,
  VoiceBackendStatus,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types.js";

/** No-op voice provider — documents the seam until a realtime provider is selected (Q32d). */
export class StubVoiceBackend implements VoiceBackend {
  readonly id = "stub" as const;

  status(): VoiceBackendStatus {
    return {
      provider: "stub",
      configured: true,
      duplex: "none",
      message:
        "Voice seam is stubbed. Set ATOM_VOICE_PROVIDER=openai-realtime (uses LLM_API_KEY) for push-to-talk MVP.",
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
  const provider = (env.ATOM_VOICE_PROVIDER?.trim().toLowerCase() || "").trim();
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1";

  const useOpenAi =
    provider === "openai-realtime" || (provider === "" && Boolean(apiKey));

  if (useOpenAi) {
    if (apiKey) {
      return new OpenAiRealtimeVoiceBackend({
        apiKey,
        baseUrl,
        ttsModel: env.ATOM_VOICE_TTS_MODEL?.trim() || undefined,
        sttModel: env.ATOM_VOICE_STT_MODEL?.trim() || undefined,
        defaultVoice: env.ATOM_VOICE_ID?.trim() || undefined,
      });
    }
    return {
      id: "openai-realtime",
      status: () => ({
        provider: "openai-realtime",
        configured: false,
        duplex: "half",
        message: 'Provider "openai-realtime" selected but LLM_API_KEY / OPENAI_API_KEY missing.',
      }),
      synthesize: async (request) => new StubVoiceBackend().synthesize(request),
    };
  }

  if (provider === "elevenlabs") {
    return {
      id: "elevenlabs",
      status: () => ({
        provider: "elevenlabs",
        configured: false,
        duplex: "none",
        message:
          'Provider "elevenlabs" selected but not implemented yet. Use openai-realtime for MVP.',
      }),
      synthesize: async (request) => new StubVoiceBackend().synthesize(request),
    };
  }

  return new StubVoiceBackend();
}
