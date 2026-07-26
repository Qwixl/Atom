/**
 * Public demo personal agent — hard scope gate before the LLM runs.
 * Meetup / get-together intents only; blocks off-topic and common injection bypasses.
 */

export const DEMO_MEETING_ONLY_REFUSE =
  "Sorry I can't help you with that, I only set agent-to-agent meetings.";

/** Shell protocol envelopes that must still reach the model during a booking flow. */
const PROTOCOL_ENVELOPE =
  /^\[(ui-event|action-decision|data-disclosure|settings-assent)\]\s*/i;

/**
 * Arranging a meeting, day out, call, coffee, pint, hangout, or other
 * two-person get-together. Keep broad enough for natural demo phrasing.
 */
const MEETING_INTENT =
  /\b(meet(ing|ings)?|schedule|schedul(e|ing)|book(ing)?|appoint(ment)?|calendars?|call|zoom|teams|hang\s*out|catch\s*up|get\s*together|day\s*out|coffee|lunch|dinner|brunch|pint|drink|drinks|beer|pub|sync|standup|stand-up|1\s*:\s*1|one[- ]on[- ]one|invite|proposal|propose|availability|free\s*time|when\s+are\s+you\s+free)\b/i;

/** Obvious override / injection attempts (still allowed if a meeting intent is present). */
const INJECTION_ATTEMPT =
  /\b(ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)|disregard\s+(your|the)\s+(instructions?|rules?|system)|you\s+are\s+now\s+|jailbreak|developer\s+mode|system\s+prompt|reveal\s+(your|the)\s+(prompt|instructions?)|pretend\s+you\s+are|act\s+as\s+(if|though)\s+there\s+are\s+no\s+rules)\b/i;

export type DemoMeetingVerdict = { action: "respond" } | { action: "refuse" };

export function evaluateDemoMeetingOnly(text: string): DemoMeetingVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { action: "refuse" };

  if (PROTOCOL_ENVELOPE.test(trimmed)) {
    // Only forward scheduling-related UI events; drop unrelated module traffic.
    if (/^\[ui-event\]/i.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      if (
        lower.includes("meetingproposed") ||
        lower.includes("scheduling") ||
        lower.includes("meeting-picker") ||
        lower.includes("meeting")
      ) {
        return { action: "respond" };
      }
      return { action: "refuse" };
    }
    return { action: "respond" };
  }

  if (MEETING_INTENT.test(trimmed)) return { action: "respond" };

  // Off-topic, or injection without a clear meetup ask — never hit the model.
  if (INJECTION_ATTEMPT.test(trimmed)) return { action: "refuse" };
  return { action: "refuse" };
}

export function isDemoMeetingOnlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ATOM_DEMO_MEETING_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
