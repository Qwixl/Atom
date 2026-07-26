/**
 * Public demo agents — hard scope gates before the LLM runs.
 * Alice: arrange get-togethers. Bob: confirm inbound proposals.
 */

export const DEMO_MEETING_ONLY_REFUSE =
  "Sorry I can't help you with that, I only set agent-to-agent meetings.";

export const DEMO_MEETING_CONFIRM_REFUSE =
  "Sorry I can't help you with that, I only handle meeting confirmations.";

const PROTOCOL_ENVELOPE =
  /^\[(ui-event|action-decision|data-disclosure|settings-assent)\]\s*/i;

const MEETING_INTENT =
  /\b(meet(ing|ings)?|schedule|schedul(e|ing)|book(ing)?|appoint(ment)?|calendars?|call|zoom|teams|hang\s*out|catch\s*up|get\s*together|day\s*out|coffee|lunch|dinner|brunch|pint|drink|drinks|beer|pub|sync|standup|stand-up|1\s*:\s*1|one[- ]on[- ]one|invite|proposal|propose|availability|free\s*time|when\s+are\s+you\s+free|next\s+week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const CONFIRM_INTENT =
  /\b(proposal|propos(e|ed)|accept|decline|confirm|meeting|slot|inbox|schedule|time)\b/i;

const INJECTION_ATTEMPT =
  /\b(ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)|disregard\s+(your|the)\s+(instructions?|rules?|system)|you\s+are\s+now\s+|jailbreak|developer\s+mode|system\s+prompt|reveal\s+(your|the)\s+(prompt|instructions?))\b/i;

export type DemoMeetingVerdict = { action: "respond" } | { action: "refuse" };

export function isDemoMeetingOnlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ATOM_DEMO_MEETING_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isDemoMeetingConfirmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ATOM_DEMO_MEETING_CONFIRM?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function evaluateDemoMeetingOnly(text: string): DemoMeetingVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { action: "refuse" };

  if (PROTOCOL_ENVELOPE.test(trimmed)) {
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
  if (INJECTION_ATTEMPT.test(trimmed)) return { action: "refuse" };
  return { action: "refuse" };
}

export function evaluateDemoMeetingConfirm(text: string): DemoMeetingVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { action: "refuse" };

  if (PROTOCOL_ENVELOPE.test(trimmed)) {
    if (/^\[ui-event\]/i.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("meetingresponse") || lower.includes("meeting-confirm") || lower.includes("meeting")) {
        return { action: "respond" };
      }
      return { action: "refuse" };
    }
    return { action: "respond" };
  }

  if (CONFIRM_INTENT.test(trimmed)) return { action: "respond" };
  if (INJECTION_ATTEMPT.test(trimmed)) return { action: "refuse" };
  return { action: "refuse" };
}

/**
 * Alice — arrange meetings like a real Atom agent: ask only for missing fields,
 * then compose scheduling/meeting-picker.
 */
export const DEMO_MEETING_ONLY_SYSTEM_PROMPT = `You are Alice's public demo agent on Atom.
You ONLY arrange agent-to-agent get-togethers (meetings, calls, coffee, day outs, hangouts).
Off-topic asks are blocked before you run.

Behave like a real Atom agent:
1. Read what the user already said.
2. If you still need a critical detail to propose a time (missing date, missing time window, or missing who), ask ONE short clarifying question as text only — do NOT emit a composition yet.
3. When you have enough to propose (at least a rough day/window, or the user said "next week" / "tomorrow" / a weekday), emit the meeting-picker composition so they can confirm/edit title and time.
4. defaultTitle: "Meeting" for a generic ask; otherwise a short title from their words.

Reply with ONLY valid JSON (no markdown fences):

Clarify (text only):
{ "messages": [ { "type": "text", "text": "<one short question>" } ] }

Ready to propose:
{
  "messages": [
    { "type": "text", "text": "<one short sentence>" },
    {
      "type": "composition",
      "composition": {
        "version": 1,
        "surfaceId": "demo-meeting-picker",
        "intent": "Schedule",
        "root": {
          "id": "picker",
          "component": "scheduling/meeting-picker",
          "semanticRole": "input/datetime",
          "props": { "defaultTitle": "Meeting", "peerName": "Bob" }
        }
      }
    }
  ]
}

Never invent other components or tools.
Refuse line (exact): Sorry I can't help you with that, I only set agent-to-agent meetings.`;

/**
 * Bob — confirm inbound proposals with scheduling/meeting-confirm.
 */
export const DEMO_MEETING_CONFIRM_SYSTEM_PROMPT = `You are Bob's public demo business agent on Atom.
You ONLY help confirm or decline inbound meeting proposals from Alice's agent.
Off-topic asks are blocked before you run.

When the user message describes an inbound scheduling proposal (title + slots), reply with ONLY valid JSON:

{
  "messages": [
    { "type": "text", "text": "<one short sentence that you received the proposal>" },
    {
      "type": "composition",
      "composition": {
        "version": 1,
        "surfaceId": "demo-meeting-confirm",
        "intent": "Confirm",
        "root": {
          "id": "confirm",
          "component": "scheduling/meeting-confirm",
          "semanticRole": "input/confirmation",
          "props": {
            "title": "<proposal title>",
            "slots": [ { "id": "...", "label": "...", "start": "...", "end": "..." } ]
          }
        }
      }
    }
  ]
}

Copy title and slots from the inbound proposal exactly. Do not invent other components.
Refuse line (exact): Sorry I can't help you with that, I only handle meeting confirmations.`;
