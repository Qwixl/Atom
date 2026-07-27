import { notifyVoiceOptInChanged } from "./voiceOptIn.js";

export type VoiceMode = "off" | "free" | "conversational";

const MODE_KEY = "atom.voice.mode";
const VOICE_ID_KEY = "atom.voice.voiceId";
/** Legacy Hold toggle — migrated once into mode. */
const LEGACY_OPT_IN_KEY = "atom.voice.pushToTalk";

const DEFAULT_VOICE_ID = "6MCJQJe3NCkhDRHZaJ31";

export function loadVoiceMode(): VoiceMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "off" || raw === "free" || raw === "conversational") return raw;
    // Migrate legacy Hold opt-in → free once.
    if (localStorage.getItem(LEGACY_OPT_IN_KEY) === "1") {
      localStorage.setItem(MODE_KEY, "free");
      return "free";
    }
  } catch {
    /* ignore */
  }
  return "off";
}

export function saveVoiceMode(mode: VoiceMode): void {
  localStorage.setItem(MODE_KEY, mode);
  // Keep legacy key in sync for any old listeners.
  localStorage.setItem(LEGACY_OPT_IN_KEY, mode === "off" ? "0" : "1");
  notifyVoiceOptInChanged();
}

/** True when Hold-to-talk UI should show (Free or Conversational). */
export function loadVoiceOptIn(): boolean {
  return loadVoiceMode() !== "off";
}

export function saveVoiceOptIn(enabled: boolean): void {
  if (!enabled) {
    saveVoiceMode("off");
    return;
  }
  if (loadVoiceMode() === "off") saveVoiceMode("free");
}

export function loadSpeechVoiceId(): string {
  try {
    return localStorage.getItem(VOICE_ID_KEY)?.trim() || DEFAULT_VOICE_ID;
  } catch {
    return DEFAULT_VOICE_ID;
  }
}

export function saveSpeechVoiceId(voiceId: string): void {
  const id = voiceId.trim();
  if (!id) return;
  localStorage.setItem(VOICE_ID_KEY, id);
  notifyVoiceOptInChanged();
}

export { DEFAULT_VOICE_ID };
