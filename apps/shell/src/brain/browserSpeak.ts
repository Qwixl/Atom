/** True free TTS via the browser (no ElevenLabs / no API). */

let speaking = false;

export function cancelBrowserSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  speaking = false;
}

export async function speakWithBrowser(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return { ok: false, error: "Nothing to say." };
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return { ok: false, error: "This browser has no free voice engine." };
  }
  cancelBrowserSpeech();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(trimmed);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => {
      speaking = false;
      resolve({ ok: true });
    };
    utter.onerror = () => {
      speaking = false;
      resolve({ ok: false, error: "Free voice failed to play." });
    };
    speaking = true;
    window.speechSynthesis.speak(utter);
  });
}

export function isBrowserSpeaking(): boolean {
  return speaking;
}
