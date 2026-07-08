/** RFC 5545 VCALENDAR builder for Atom accepted-meeting publish feed (M-ECO-08). */

export interface IcalEventInput {
  uid: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
}

function formatIcsUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date for ICS export");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcsEvent(opts: IcalEventInput): string {
  const stamp = formatIcsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsUtc(opts.start)}`,
    `DTEND:${formatIcsUtc(opts.end)}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
  ];
  if (opts.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(opts.description)}`);
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function buildIcsCalendar(events: IcalEventInput[]): string {
  const body = events.map((event) => buildIcsEvent(event)).join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atom//AcceptedMeetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    body,
    "END:VCALENDAR",
  ].join("\r\n");
}
