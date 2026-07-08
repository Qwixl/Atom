/** CalDAV HTTP helpers (PROPFIND, REPORT, PUT) with Basic auth — BK-05. */

import { validateConnectorHttpsUrl } from "./connectorUrl.js";

export interface CalDavAuth {
  username: string;
  password: string;
}

function basicAuthHeader(auth: CalDavAuth): string {
  const encoded = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

export function normalizeCalDavCalendarUrl(raw: string): string {
  const url = validateConnectorHttpsUrl(raw.trim());
  return url.endsWith("/") ? url : `${url}/`;
}

export function formatCalDavTimeRange(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date "${iso}"`);
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function caldavRequest(
  url: string,
  method: string,
  auth: CalDavAuth,
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: basicAuthHeader(auth),
      ...headers,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CalDAV ${method} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return { status: response.status, text };
}

export function parseCalendarDataFromMultistatus(xml: string): string[] {
  const chunks: string[] = [];
  const re = /<(?:C:|cal:)calendar-data[^>]*>([\s\S]*?)<\/(?:C:|cal:)calendar-data>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    chunks.push(
      raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"'),
    );
  }
  return chunks;
}

export function parseCalendarsFromPropfind(xml: string): Array<{ href: string; name?: string }> {
  const calendars: Array<{ href: string; name?: string }> = [];
  const responseRe = /<(?:D:|d:)?response[\s>]([\s\S]*?)<\/(?:D:|d:)?response>/gi;
  let block: RegExpExecArray | null;
  while ((block = responseRe.exec(xml)) !== null) {
    const chunk = block[1] ?? "";
    const hrefMatch = chunk.match(/<(?:D:|d:)?href[^>]*>([^<]+)<\/(?:D:|d:)?href>/i);
    const href = hrefMatch?.[1]?.trim();
    if (!href) continue;
    const nameMatch = chunk.match(
      /<(?:D:|d:)?displayname[^>]*>([\s\S]*?)<\/(?:D:|d:)?displayname>/i,
    );
    const name = nameMatch?.[1]?.trim();
    calendars.push({ href, name: name || undefined });
  }
  return calendars;
}

const CALENDAR_QUERY_BODY = (start: string, end: string) => `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${start}" end="${end}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

export async function reportCalendarEvents(
  calendarUrl: string,
  auth: CalDavAuth,
  timeMin: string,
  timeMax: string,
): Promise<string[]> {
  const url = normalizeCalDavCalendarUrl(calendarUrl);
  const start = formatCalDavTimeRange(timeMin);
  const end = formatCalDavTimeRange(timeMax);
  const { text } = await caldavRequest(url, "REPORT", auth, CALENDAR_QUERY_BODY(start, end), {
    Depth: "1",
    "Content-Type": "application/xml; charset=utf-8",
  });
  return parseCalendarDataFromMultistatus(text);
}

export async function propfindCalendars(calendarUrl: string, auth: CalDavAuth): Promise<Array<{ href: string; name?: string }>> {
  const url = normalizeCalDavCalendarUrl(calendarUrl);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`;
  const { text } = await caldavRequest(url, "PROPFIND", auth, body, {
    Depth: "1",
    "Content-Type": "application/xml; charset=utf-8",
  });
  return parseCalendarsFromPropfind(text);
}

export async function putCalendarObject(
  calendarUrl: string,
  auth: CalDavAuth,
  objectName: string,
  icsBody: string,
): Promise<void> {
  const base = normalizeCalDavCalendarUrl(calendarUrl);
  const fileName = objectName.endsWith(".ics") ? objectName : `${objectName}.ics`;
  const target = new URL(fileName, base).toString();
  await caldavRequest(target, "PUT", auth, icsBody, {
    "Content-Type": "text/calendar; charset=utf-8",
  });
}
