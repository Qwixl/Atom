/** Google Calendar CalDAV (RFC 4791) — server-side proxy; token from env or request body (dev). */

export const GOOGLE_CALDAV_ROOT = "https://apidata.googleusercontent.com/caldav/v2/";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export interface CalendarEventSummary {
  uid: string;
  summary: string;
  start: string;
  end: string;
}

export interface CreateCalendarEventInput {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

const eventsUrlCache = new Map<string, string>();

export function resolveGoogleCalendarAccessToken(
  envToken: string | null | undefined,
  requestToken?: string,
): string {
  const token = requestToken?.trim() || envToken?.trim();
  if (!token) {
    throw new Error(
      "Google Calendar access token not configured (set GOOGLE_CALENDAR_ACCESS_TOKEN or pass accessToken)",
    );
  }
  return token;
}

export function toIcalUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function escapeIcalText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildICalendarEvent(input: CreateCalendarEventInput & { uid: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Qwixl Atom//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${toIcalUtc(new Date().toISOString())}`,
    `DTSTART:${toIcalUtc(input.start)}`,
    `DTEND:${toIcalUtc(input.end)}`,
    `SUMMARY:${escapeIcalText(input.title.trim())}`,
  ];
  if (input.location?.trim()) {
    lines.push(`LOCATION:${escapeIcalText(input.location.trim())}`);
  }
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcalText(input.description.trim())}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function parseVEventFromCalendarData(data: string): CalendarEventSummary | null {
  const uid = data.match(/^UID:(.+)$/m)?.[1]?.trim();
  const summary = data.match(/^SUMMARY:(.+)$/m)?.[1]?.trim();
  const dtStart = data.match(/^DTSTART(?::;[^:]*)?:(.+)$/m)?.[1]?.trim();
  const dtEnd = data.match(/^DTEND(?::;[^:]*)?:(.+)$/m)?.[1]?.trim();
  if (!uid || !summary || !dtStart || !dtEnd) return null;
  return {
    uid,
    summary: summary.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";"),
    start: parseIcalUtcToIso(dtStart),
    end: parseIcalUtcToIso(dtEnd),
  };
}

function parseIcalUtcToIso(value: string): string {
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = value.slice(0, 4);
    const mo = value.slice(4, 6);
    const d = value.slice(6, 8);
    const h = value.slice(9, 11);
    const mi = value.slice(11, 13);
    const s = value.slice(13, 15);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  }
  return value;
}

function toCalDavTimeRange(iso: string): string {
  return toIcalUtc(iso).replace(/[-:]/g, "").replace("Z", "Z");
}

export async function discoverEventsCollectionUrl(accessToken: string): Promise<string> {
  const cached = eventsUrlCache.get(accessToken);
  if (cached) return cached;

  const userResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userResp.ok) {
    throw new Error(`Google userinfo failed (${userResp.status})`);
  }
  const user = (await userResp.json()) as { email?: string };
  if (!user.email?.trim()) {
    throw new Error("Google userinfo did not return email");
  }

  const eventsUrl = `${GOOGLE_CALDAV_ROOT}${encodeURIComponent(user.email)}/events/`;
  eventsUrlCache.set(accessToken, eventsUrl);
  return eventsUrl;
}

export async function queryCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEventSummary[]> {
  const eventsUrl = await discoverEventsCollectionUrl(accessToken);
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${toCalDavTimeRange(timeMin)}" end="${toCalDavTimeRange(timeMax)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const resp = await fetch(eventsUrl, {
    method: "REPORT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "1",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`CalDAV calendar-query failed (${resp.status})`);
  }

  const xml = await resp.text();
  const events: CalendarEventSummary[] = [];
  for (const block of xml.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>/gi) ?? []) {
    const inner = block.replace(/<\/?C:calendar-data[^>]*>/gi, "").trim();
    const decoded = inner
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const parsed = parseVEventFromCalendarData(decoded);
    if (parsed) events.push(parsed);
  }
  return events;
}

export async function createCalendarEvent(
  accessToken: string,
  input: CreateCalendarEventInput,
): Promise<{ uid: string; href: string }> {
  const eventsUrl = await discoverEventsCollectionUrl(accessToken);
  const uid = crypto.randomUUID();
  const ical = buildICalendarEvent({ ...input, uid });
  const href = `${eventsUrl}${uid}.ics`;

  const resp = await fetch(href, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: ical,
  });
  if (!resp.ok) {
    throw new Error(`CalDAV event create failed (${resp.status})`);
  }
  return { uid, href };
}
