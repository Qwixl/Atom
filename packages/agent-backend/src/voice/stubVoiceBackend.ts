import { loadElevenLabsConvAiConfig } from "./elevenLabsConvAi.js";
import { synthesizeElevenLabs } from "./elevenLabsTts.js";
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
      message: "Voice is not set up on this agent yet.",
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

function elevenLabsApiKey(env: NodeJS.ProcessEnv): string {
  return (
    env.ELEVENLABS_API_KEY?.trim() ||
    env.ATOM_PLATFORM_ELEVENLABS_KEY?.trim() ||
    env.XI_API_KEY?.trim() ||
    ""
  );
}

/** Speak via ElevenLabs when platform key is set (OpenRouter LLM keys cannot TTS). */
function withElevenLabsSpeak(
  base: VoiceBackend,
  env: NodeJS.ProcessEnv,
): VoiceBackend {
  const elKey = elevenLabsApiKey(env);
  if (!elKey) return base;
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || env.ATOM_VOICE_ID?.trim() || undefined;
  const apiBaseUrl = env.ELEVENLABS_API_BASE_URL?.trim() || undefined;
  const convai = loadElevenLabsConvAiConfig(env);
  return {
    id: base.id,
    status: () => {
      const s = base.status();
      return {
        ...s,
        configured: true,
        duplex: convai ? "full" : s.duplex,
        message: "Voice ready.",
      };
    },
    synthesize: async (request) =>
      synthesizeElevenLabs(elKey, request, { voiceId, apiBaseUrl }),
    transcribe: base.transcribe?.bind(base),
  };
}

/** ConvAI status when there is no LLM key for STT. */
function elevenLabsOnlyBackend(env: NodeJS.ProcessEnv): VoiceBackend {
  const convai = loadElevenLabsConvAiConfig(env);
  const elKey = elevenLabsApiKey(env);
  const configured = Boolean(convai) || Boolean(elKey);
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || env.ATOM_VOICE_ID?.trim() || undefined;
  const apiBaseUrl = env.ELEVENLABS_API_BASE_URL?.trim() || undefined;
  return {
    id: "elevenlabs",
    status: () => ({
      provider: "elevenlabs",
      configured,
      duplex: convai ? "full" : elKey ? "half" : "none",
      message: configured ? "Voice ready." : "Voice is not set up on this agent yet.",
    }),
    synthesize: async (request) => {
      if (!elKey) return new StubVoiceBackend().synthesize(request);
      return synthesizeElevenLabs(elKey, request, { voiceId, apiBaseUrl });
    },
  };
}

export function loadVoiceBackend(env: NodeJS.ProcessEnv = process.env): VoiceBackend {
  const provider = (env.ATOM_VOICE_PROVIDER?.trim().toLowerCase() || "").trim();
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1";
  const convaiConfigured = Boolean(loadElevenLabsConvAiConfig(env));
  const elKey = elevenLabsApiKey(env);

  const useOpenAiStt =
    Boolean(apiKey) &&
    (provider === "" || provider === "openai-realtime" || provider === "elevenlabs");

  if (useOpenAiStt) {
    const openai = new OpenAiRealtimeVoiceBackend({
      apiKey,
      baseUrl,
      ttsModel: env.ATOM_VOICE_TTS_MODEL?.trim() || undefined,
      sttModel: env.ATOM_VOICE_STT_MODEL?.trim() || undefined,
      defaultVoice: env.ATOM_VOICE_ID?.trim() || undefined,
    });
    return withElevenLabsSpeak(openai, env);
  }

  if (provider === "openai-realtime") {
    return {
      id: "openai-realtime",
      status: () => ({
        provider: "openai-realtime",
        configured: false,
        duplex: "half",
        message: "Voice is not set up on this agent yet.",
      }),
      synthesize: async (request) => new StubVoiceBackend().synthesize(request),
    };
  }

  if (provider === "elevenlabs" || elKey || convaiConfigured) {
    return elevenLabsOnlyBackend(env);
  }

  return new StubVoiceBackend();
}
