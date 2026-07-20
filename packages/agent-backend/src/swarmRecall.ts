/**
 * Vague-recall triggers and held-back conversation outlines (D090).
 * Summaries stay out of normal turns; "do you remember…" surfaces outline-level detail.
 */

const RECALL_RE =
  /\b(do you remember|did you remember|remember when|remember that|remember the|you remember|recall when|recall that|have you forgotten|forgot about)\b/i;

export function isVagueRecallPrompt(text: string): boolean {
  return RECALL_RE.test(text.trim());
}

/** Heuristic outline from short-term turns (no second LLM call). */
export function outlineFromTurns(
  turns: ReadonlyArray<{ role: "user" | "assistant"; text: string }>,
): string {
  if (turns.length === 0) return "";
  const bits: string[] = [];
  for (const turn of turns) {
    const snippet = turn.text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!snippet) continue;
    bits.push(turn.role === "user" ? `They: ${snippet}` : `You: ${snippet}`);
  }
  const joined = bits.join(" · ");
  return joined.length > 900 ? `${joined.slice(0, 897)}…` : joined;
}

export function formatVagueRecallBlock(outlines: string[]): string {
  if (outlines.length === 0) {
    return `## Vague recall

You were asked whether you remember something. You have no matching conversation outlines for this peer.
Answer honestly that you do not clearly remember — do not invent details. You may still use long-term memories listed above if they match.`;
  }
  const lines = outlines.map((o, i) => `${i + 1}. ${o}`);
  return `## Vague recall (outline only)

You were asked to remember something. These are **fuzzy outlines** of past interactions — not full transcripts.
You may recall the gist but not exact wording. If nothing fits, say you do not clearly remember.
Do not invent specifics that are not in these outlines or your long-term memories.

${lines.join("\n")}`;
}
