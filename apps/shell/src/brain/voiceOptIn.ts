/** Fired when Agent voice toggles change so Chat can show/hide controls immediately. */
export const VOICE_OPTIN_EVENT = "atom-voice-optin";

export function notifyVoiceOptInChanged(): void {
  try {
    window.dispatchEvent(new Event(VOICE_OPTIN_EVENT));
  } catch {
    /* ignore */
  }
}
