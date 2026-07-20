/**
 * AS-07 — cheap intent gate for swarm NPCs (D087).
 * Prompt covers conduct; this is an infra backstop for clearly abusive *intents*.
 */

const ABUSIVE_INTENT =
  /\b(kill yourself|kys|i('ll| will) (find|hurt|kill) you|doxx|swat you|rape|child porn|csam)\b/i;

export type SwarmAbuseVerdict =
  | { action: "respond" }
  | { action: "refuse"; reason: "abusive_intent" };

/** Decide whether an inbound human/non-NPC message should get a normal NPC reply. */
export function evaluateInboundForNpc(text: string): SwarmAbuseVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { action: "respond" };
  if (ABUSIVE_INTENT.test(trimmed)) {
    return { action: "refuse", reason: "abusive_intent" };
  }
  return { action: "respond" };
}

/** Fixed refuse line — no escalation, no mirroring insults. */
export const SWARM_ABUSE_REFUSE_TEXT =
  "I won't engage with that. If you want to talk about something else in Atom, I'm here.";
