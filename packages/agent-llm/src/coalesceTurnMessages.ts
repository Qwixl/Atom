/** Coalesce agent protocol messages for a single turn (briefing dedup). */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compositionIntent(message: Record<string, unknown>): string {
  const composition = message.composition;
  if (!isRecord(composition)) return "";
  return typeof composition.intent === "string" ? composition.intent : "";
}

function isBriefingComposition(message: Record<string, unknown>): boolean {
  if (message.type !== "composition") return false;
  const composition = message.composition;
  if (!isRecord(composition)) return false;
  if (composition.surfaceId === "briefing-daily") return true;
  return /briefing|roundup/i.test(compositionIntent(message));
}

/** Drop duplicate briefing text/compositions; keep one short intro + one briefing composition. */
export function coalesceTurnMessages(messages: unknown[]): unknown[] {
  const typed = messages.filter(isRecord);
  const compositions = typed.filter((m) => m.type === "composition");
  const briefingCompositions = compositions.filter(isBriefingComposition);

  if (briefingCompositions.length === 0) {
    return typed;
  }

  const other = typed.filter((m) => m.type !== "composition" && m.type !== "text");
  const texts = typed.filter((m) => m.type === "text");
  const shortTexts = texts.filter(
    (m) => typeof m.text === "string" && m.text.trim().length <= 120,
  );
  const shortIntro =
    shortTexts.find((m) => typeof m.text === "string" && !m.text.includes("\n")) ??
    shortTexts[shortTexts.length - 1] ??
    null;
  const lastBriefing = briefingCompositions[briefingCompositions.length - 1];

  return [...(shortIntro ? [shortIntro] : []), lastBriefing, ...other];
}
