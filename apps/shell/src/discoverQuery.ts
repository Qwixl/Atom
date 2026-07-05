/** Heuristic: route natural-language discover intent to the agent search API (M19.5). */

const DISCOVER_VERBS = /\b(find|search|discover|look\s+for|where\s+(can|do)|join)\b/i;
const DISCOVER_TOPICS = /\b(coffee|shop|room|community|business|agent|space|venue|place|online)\b/i;

export function isDiscoverQuery(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("@")) return true;
  if (/^(find|search)\b/i.test(trimmed)) return true;
  return DISCOVER_VERBS.test(trimmed) && DISCOVER_TOPICS.test(trimmed);
}

export function extractDiscoverTerms(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("@")) return trimmed;
  const stripped = trimmed
    .replace(/^(please\s+)?(find|search for|search|discover|look for)\s+(me\s+)?(a\s+)?/i, "")
    .replace(/\?$/, "")
    .trim();
  return stripped || trimmed;
}
