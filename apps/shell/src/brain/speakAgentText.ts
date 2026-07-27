import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";
import type { CommsAgentConfig } from "../comms/types.js";

export type SpeakResult = { ok: true } | { ok: false; error: string };

let sharedAudio: HTMLAudioElement | null = null;

/** Speak agent reply text via the agent voice API. */
export async function speakAgentText(
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
