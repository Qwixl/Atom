/** Open Google Calendar "create event" with prefilled fields — no OAuth required. */

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
