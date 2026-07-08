/** Open Google Calendar "create event" with prefilled fields — no OAuth required. */

import type { ConsequentialAction } from "@qwixl/shell-core";

export function buildGoogleCalendarAddUrl(opts: {
  title: string;
  start: string;
  end: string;
  description?: string;
}): string {
  const toGoogleDate = (iso: string): string =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toGoogleDate(opts.start)}/${toGoogleDate(opts.end)}`,
  });
  if (opts.description?.trim()) {
    params.set("details", opts.description.trim());
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function calendarAddUrlFromAction(action: ConsequentialAction): string | null {
  const start = action.terms.start;
  const end = action.terms.end;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const title =
    typeof action.terms.event === "string"
      ? action.terms.event
      : typeof action.terms.title === "string"
        ? action.terms.title
        : action.title;
  return buildGoogleCalendarAddUrl({ title: String(title), start, end });
}

/** Personal calendar block — opens Google Calendar prefilled; no agent write or payment. */
export function isPersonalCalendarAddAction(action: ConsequentialAction): boolean {
  if (action.kind !== "confirmation") return false;
  if (typeof action.terms.start !== "string" || typeof action.terms.end !== "string") return false;
  const title = `${action.title} ${String(action.terms.event ?? "")}`.toLowerCase();
  return (
    title.includes("calendar") ||
    title.includes("reminder") ||
    title.includes("appointment") ||
    typeof action.terms.event === "string"
  );
}
