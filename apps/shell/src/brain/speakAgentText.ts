import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";
import type { CommsAgentConfig } from "../comms/types.js";
import { supabaseAccessToken } from "../auth/hostedAccount.js";
import { CONTROL_PLANE_URL } from "../hostConfig.js";
import { cancelBrowserSpeech, speakWithBrowser } from "./browserSpeak.js";
import { loadSpeechVoiceId, loadVoiceMode, saveVoiceMode, type VoiceMode } from "./voiceMode.js";

export type SpeakResult =
  | { ok: true; fellBackToFree?: boolean }
  | { ok: false; error: string; creditsExhausted?: boolean };

let sharedAudio: HTMLAudioElement | null = null;

function stopSharedAudio(): void {
  if (!sharedAudio) return;
  try {
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
}

async function speakElevenLabsViaControlPlane(
  text: string,
  voiceId: string,
): Promise<SpeakResult> {
  const cp = CONTROL_PLANE_URL.replace(/\/$/, "");
  if (!cp) return { ok: false, error: "Control plane not configured." };
  const token = await supabaseAccessToken();
  if (!token) return { ok: false, error: "Sign in to use Conversational voice." };
  const syn = await fetch(`${cp}/voice/synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, voiceId }),
  });
  const body = (await syn.json().catch(() => ({}))) as {
    audioBase64?: string | null;
    mimeType?: string | null;
    error?: string;
  };
  if (syn.status === 402) {
    return {
      ok: false,
      error: body.error || "Insufficient Atom Credits.",
      creditsExhausted: true,
    };
  }
  if (!syn.ok) {
    return { ok: false, error: body.error || `Voice failed (${syn.status})` };
  }
  if (!body.audioBase64) {
    return { ok: false, error: "Voice returned no audio." };
  }
  const mime = body.mimeType || "audio/mpeg";
  if (!sharedAudio) sharedAudio = new Audio();
  stopSharedAudio();
  sharedAudio.src = `data:${mime};base64,${body.audioBase64}`;
  sharedAudio.volume = 1;
  await sharedAudio.play();
  return { ok: true };
}

/** Speak agent reply according to voice mode (off / free / conversational). */
export async function speakAgentText(
  text: string,
  _config: CommsAgentConfig,
  options?: { humanFilter?: boolean; mode?: VoiceMode },
): Promise<SpeakResult> {
  void options?.humanFilter;
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return { ok: false, error: "Nothing to say." };

  const mode = options?.mode ?? loadVoiceMode();
  if (mode === "off") return { ok: true };

  cancelBrowserSpeech();
  stopSharedAudio();

  if (mode === "free") {
    return speakWithBrowser(trimmed);
  }

  // conversational
  const voiceId = loadSpeechVoiceId();
  const paid = await speakElevenLabsViaControlPlane(trimmed, voiceId);
  if (paid.ok) return paid;
  if (paid.creditsExhausted) {
    saveVoiceMode("free");
    const free = await speakWithBrowser(trimmed);
    if (free.ok) {
      return { ok: true, fellBackToFree: true };
    }
    return {
      ok: false,
      error: "Credits ran out — switched to free voice, but free voice failed.",
      creditsExhausted: true,
    };
  }
  return paid;
}

/** @deprecated Prefer speakAgentText; kept for callers that only need agent-local TTS. */
export async function speakAgentTextViaAgent(
  text: string,
  config: CommsAgentConfig,
  options?: { humanFilter?: boolean },
): Promise<SpeakResult> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return { ok: false, error: "Nothing to say." };
  try {
    const admin = config.adminUrl?.trim() ? config : await loadCommsAgentConfigSecure();
    const base = admin.adminUrl?.replace(/\/$/, "");
    if (!base) return { ok: false, error: "Agent not connected." };
    const bearer =
      getChatSessionToken()?.trim() ||
      admin.adminToken?.trim() ||
      (await loadCommsAgentConfigSecure()).adminToken?.trim() ||
      "";
    if (!bearer) return { ok: false, error: "Unlock your vault / sign in to use voice." };
    const syn = await fetch(`${base}/voice/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        text: trimmed,
        humanFilter: options?.humanFilter !== false,
        voiceId: loadSpeechVoiceId(),
      }),
    });
    const body = (await syn.json().catch(() => ({}))) as {
      audioBase64?: string | null;
      mimeType?: string | null;
      error?: string;
    };
    if (!syn.ok) {
      return { ok: false, error: body.error || `Voice failed (${syn.status})` };
    }
    if (!body.audioBase64) {
      return { ok: false, error: "Voice returned no audio." };
    }
    const mime = body.mimeType || "audio/mpeg";
    if (!sharedAudio) sharedAudio = new Audio();
    stopSharedAudio();
    sharedAudio.src = `data:${mime};base64,${body.audioBase64}`;
    sharedAudio.volume = 1;
    await sharedAudio.play();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/NotAllowedError|play\(\)/i.test(msg)) {
      return {
        ok: false,
        error: "Tap Talk or Hold to talk once so this browser can play sound.",
      };
    }
    return { ok: false, error: msg };
  }
}
