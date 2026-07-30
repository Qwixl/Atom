/**
 * Shared due-evaluation for interval and daily-time schedules.
 * Used by standing intents (BK-42) and presentation-board refresh (PS-05).
 */

import { localDateKey, parseHhMm } from "./standingIntents.js";

export type IntervalOrDailyTrigger =
  | { type: "daily-time"; time: string; timezone?: string }
  | { type: "interval"; everyMinutes: number };

/** Whether an interval or daily-time schedule is due at `now` given last fire time in ms. */
export function isIntervalOrDailyDue(
  trigger: IntervalOrDailyTrigger,
  lastFiredMs: number | null,
  now: Date,
): boolean {
  const lastValid = lastFiredMs !== null && Number.isFinite(lastFiredMs) ? lastFiredMs : null;

  switch (trigger.type) {
    case "daily-time": {
      const target = parseHhMm(trigger.time);
      if (!target) return false;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const targetMins = target.hours * 60 + target.minutes;
      if (nowMins < targetMins) return false;
      if (lastValid !== null && localDateKey(new Date(lastValid)) === localDateKey(now)) {
        return false;
      }
      return true;
    }
    case "interval": {
      const everyMs = trigger.everyMinutes * 60_000;
      if (lastValid === null) return true;
      return now.getTime() - lastValid >= everyMs;
    }
    default:
      return false;
  }
}
