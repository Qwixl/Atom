import type { VoiceSynthesisRequest, VoiceSynthesisResult } from "./types.js";

/** Default multilingual voice — override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * ElevenLabs text-to-speech for agent replies / push-to-talk playback.
 * Live duplex chat uses ConvAI tokens separately.
 */
export async function synthesizeElevenLabs(
  apiKey: string,
  request: VoiceSynthesisRequest,
  options?: { voiceId?: string; apiBaseUrl?: string },
): Promise<VoiceSynthesisResult> {
  const text = request.text.trim();
  if (!text) {
    return { audioBase64: null, mimeType: null, textEcho: "" };
  }
  const voiceId = (request.voiceId || options?.voiceId || DEFAULT_VOICE_ID).trim();
  const base = (options?.apiBaseUrl || "https://api.elevenlabs.io").replace(/\/$/, "");
  const resp = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS HTTP ${resp.status}: ${errText.slice(0, 240)}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return {
    audioBase64: buf.toString("base64"),
    mimeType: "audio/mpeg",
    textEcho: text,
  };
}
