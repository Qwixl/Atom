/**
 * Light spoken-path naturalization before TTS.
 * Keeps meaning; adds restrained fillers/pauses; optional emotion tag for providers that honor it.
 * Chat transcript should keep the original text — apply only on synthesize.
 */

export type HumanFilterResult = {
  text: string;
  /** Soft cue for TTS providers; never theatrical. */
  emotion?: "calm" | "warm" | "focused" | "neutral";
};

const FILLERS = ["right,", "so,", "okay,", "well,"] as const;

function pickFiller(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % FILLERS.length;
  return FILLERS[h]!;
}

function inferEmotion(text: string): HumanFilterResult["emotion"] {
  const lower = text.toLowerCase();
  if (/\b(sorry|unfortunately|can't|cannot|failed)\b/.test(lower)) return "calm";
  if (/\b(great|glad|happy|welcome|thanks)\b/.test(lower)) return "warm";
  if (/\b(next|schedule|remind|checklist|step)\b/.test(lower)) return "focused";
  return "neutral";
}

/** Convert plain agent reply into slightly more spoken prose for TTS. */
export function applyHumanFilter(raw: string): HumanFilterResult {
  let text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { text: "", emotion: "neutral" };

  // Strip markdown-ish chrome that sounds bad aloud.
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  const emotion = inferEmotion(text);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) return { text, emotion };

  // Occasional soft opener on longer replies only.
  if (text.length > 80 && !/^(right|so|okay|well|yes|no)\b/i.test(sentences[0]!)) {
    sentences[0] = `${pickFiller(text)} ${sentences[0]}`;
  }

  // Insert a short pause marker between denser sentences (SSML-ish ellipsis).
  const withPauses = sentences.map((s, i) => {
    if (i === 0) return s;
    if (s.length > 48) return `… ${s}`;
    return s;
  });

  return { text: withPauses.join(" ").replace(/\s+/g, " ").trim(), emotion };
}
