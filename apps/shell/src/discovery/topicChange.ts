/** Heuristic: free-form chat that is not continuing the active discovery thread. */

const CONTINUATION =
  /\b(?:this|that|it|them|those|these|same|article|story|piece|link|headline|above|further|more|also|keep|continue|expand|deeper|related|source)\b/i;
const PROTOCOL = /^\[(?:briefing-open|link-intent|ui-event|game-turn|format-error)\b/i;

export function isDiscoveryTopicChange(
  text: string,
  pathLabel: string | undefined,
  stepTitles: readonly string[],
): boolean {
  const trimmed = text.trim();
  if (!trimmed || PROTOCOL.test(trimmed)) return false;
  if (CONTINUATION.test(trimmed) && trimmed.length < 160) return false;

  const haystack = `${pathLabel ?? ""} ${stepTitles.join(" ")}`.toLowerCase();
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
  if (tokens.length === 0) return true;
  if (!haystack.trim()) return true;

  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  const overlap = hits / tokens.length;
  // Weather after a football explore path has ~0 overlap → hide.
  return overlap < 0.2 && tokens.length >= 2;
}
