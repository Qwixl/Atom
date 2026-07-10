import type {
  VoiceBackend,
  VoiceBackendStatus,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
  VoiceTranscriptionRequest,
  VoiceTranscriptionResult,
} from "./types.js";

/**
 * OpenAI audio MVP behind the VoiceBackend seam.
 * Uses Whisper transcription + TTS speech endpoints (half-duplex).
 * Full Realtime WebRTC duplex remains a later upgrade on the same provider id.
 */
export class OpenAiRealtimeVoiceBackend implements VoiceBackend {
  readonly id = "openai-realtime" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly ttsModel: string;
  private readonly sttModel: string;
  private readonly defaultVoice: string;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    ttsModel?: string;
    sttModel?: string;
    defaultVoice?: string;
  }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.ttsModel = options.ttsModel ?? "gpt-4o-mini-tts";
    this.sttModel = options.sttModel ?? "whisper-1";
    this.defaultVoice = options.defaultVoice ?? "alloy";
  }

  status(): VoiceBackendStatus {
    return {
      provider: this.id,
      configured: Boolean(this.apiKey),
      duplex: "half",
      message: this.apiKey
        ? "OpenAI voice ready (Whisper STT + TTS). Push-to-talk half-duplex."
        : "OpenAI voice selected but LLM_API_KEY / OPENAI_API_KEY missing.",
    };
  }

  async synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
    const text = request.text.trim();
    if (!text) {
      return { audioBase64: null, mimeType: null, textEcho: "" };
    }
    if (!this.apiKey) {
      throw new Error("OpenAI voice not configured");
    }
    const resp = await fetch(`${this.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.ttsModel,
        voice: request.voiceId?.trim() || this.defaultVoice,
        input: text.slice(0, 4096),
        response_format: "mp3",
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`OpenAI TTS HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      audioBase64: buf.toString("base64"),
      mimeType: "audio/mpeg",
      textEcho: text,
    };
  }

  async transcribe(request: VoiceTranscriptionRequest): Promise<VoiceTranscriptionResult> {
    if (!this.apiKey) throw new Error("OpenAI voice not configured");
    const mime = request.mimeType?.trim() || "audio/webm";
    const filename = request.filename?.trim() || guessFilename(mime);
    const bytes = Buffer.from(request.audioBase64, "base64");
    const form = new FormData();
    form.append("model", this.sttModel);
    form.append("file", new Blob([bytes], { type: mime }), filename);

    const resp = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`OpenAI STT HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  }
}

function guessFilename(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "audio.m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("ogg")) return "audio.ogg";
  return "audio.webm";
}
