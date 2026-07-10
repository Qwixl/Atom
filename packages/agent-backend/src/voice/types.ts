/**
 * Pluggable realtime voice seam (D077 / BK-46).
 * Full-duplex WebRTC is deferred — providers implement STT/TTS streams first.
 */

export type VoiceProviderId = "stub" | "openai-realtime" | "elevenlabs";

export interface VoiceBackendStatus {
  provider: VoiceProviderId;
  configured: boolean;
  duplex: "none" | "half" | "full";
  message: string;
}

export interface VoiceSynthesisRequest {
  text: string;
  /** Optional voice id from the provider catalog. */
  voiceId?: string;
}

export interface VoiceSynthesisResult {
  /** Base64 audio when a provider produces bytes; stub returns null. */
  audioBase64: string | null;
  mimeType: string | null;
  /** Provider may return text confirmation only until duplex lands. */
  textEcho: string;
}

export interface VoiceBackend {
  readonly id: VoiceProviderId;
  status(): VoiceBackendStatus;
  /** Text-to-speech. Stub echoes text without audio. */
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
}
