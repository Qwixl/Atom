/** Scheduling intent heuristic for surfacing the meeting-picker module inline. */
const SCHEDULING_HINT =
  /\b(meet(?:ing|up)?|appointment|schedule|catch ?up|call|book(?:ing)?|see you|get together|available|availability)\b/i;

export function looksLikeSchedulingIntent(text: string): boolean {
  return SCHEDULING_HINT.test(text);
}
