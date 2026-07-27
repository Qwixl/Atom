import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import type { CommsAgentConfig } from "../comms/types.js";

let audioUnlocked = false;
let sharedAudio: HTMLAudioElement | null = null;

/** Call from a click/tap (toggle, Talk, Hold) so later reply playback is allowed. */
export async function unlockAgentAudio(): Promise<void> {
  if (audioUnlocked || typeof Audio === "undefined") return;
  try {
    if (!sharedAudio) sharedAudio = new Audio();
    // Tiny silent wav
    sharedAudio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    sharedAudio.volume = 0.01;
    await sharedAudio.play();
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
    audioUnlocked = true;
  } catch {
    /* first gesture may still fail; Talk/Hold will retry */
  }
}

export type SpeakResult =
  | { ok: true }
  | { ok: false; error: string };

/** Speak agent reply text via the agent voice API. */
export async function speakAgentText(
  text: string,
  config: CommsAgentConfig,
  options?: { humanFilter?: boolean },
): Promise<SpeakResult> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return { ok: false, error: "Nothing to say." };
  try {
    await unlockAgentAudio();
    const admin = config.adminToken?.trim()
      ? config
      : await loadCommsAgentConfigSecure();
    if (!admin.adminUrl?.trim()) {
      return { ok: false, error: "Agent not connected." };
    }
    if (!admin.adminToken?.trim()) {
      return { ok: false, error: "Unlock your vault to use voice." };
    }
    const base = admin.adminUrl.replace(/\/$/, "");
    const syn = await fetch(`${base}/voice/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.adminToken.trim()}`,
      },
      body: JSON.stringify({
        text: trimmed,
        humanFilter: options?.humanFilter !== false,
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
    sharedAudio.src = `data:${mime};base64,${body.audioBase64}`;
    sharedAudio.volume = 1;
    await sharedAudio.play();
    audioUnlocked = true;
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/NotAllowedError|play\(\)/i.test(msg) || /user didn't interact/i.test(msg)) {
      return {
        ok: false,
        error: "Tap Talk or Hold to talk once so this browser can play sound.",
      };
    }
    return { ok: false, error: msg };
  }
}
