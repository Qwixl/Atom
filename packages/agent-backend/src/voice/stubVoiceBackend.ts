import { loadElevenLabsConvAiConfig } from "./elevenLabsConvAi.js";
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
        "Voice seam is stubbed. Set ATOM_VOICE_PROVIDER=openai-realtime (uses LLM_API_KEY) for push-to-talk, or configure ELEVENLABS_* for Conversational AI.",
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

/** ConvAI token mint lives on /voice/convai/*; this backend marks provider status only. */
function elevenLabsVoiceBackend(env: NodeJS.ProcessEnv): VoiceBackend {
  const convai = loadElevenLabsConvAiConfig(env);
  const configured = Boolean(convai);
  return {
    id: "elevenlabs",
    status: () => ({
      provider: "elevenlabs",
      configured,
      duplex: configured ? "full" : "none",
      message: configured
        ? "ElevenLabs Conversational AI ready (mint tokens via POST /voice/convai/token)."
        : 'Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID (or ATOM_PLATFORM_ELEVENLABS_*).',
    }),
    synthesize: async (request) => new StubVoiceBackend().synthesize(request),
  };
}

export function loadVoiceBackend(env: NodeJS.ProcessEnv = process.env): VoiceBackend {
  const provider = (env.ATOM_VOICE_PROVIDER?.trim().toLowerCase() || "").trim();
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1";
  const convaiConfigured = Boolean(loadElevenLabsConvAiConfig(env));

  if (provider === "elevenlabs" || (provider === "" && convaiConfigured && !apiKey)) {
    return elevenLabsVoiceBackend(env);
  }

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

  return new StubVoiceBackend();
}
