/** Read-only ICS/WebCal feed fetch and parse — feed URLs stored in agent vault (D044). */

import { validateConnectorHttpsUrl } from "./connectorUrl.js";

export interface CalendarEventSummary {
  uid: string;
  summary: string;
  start: string;
  end: string;
  feedId?: string;
}

export function normalizeWebcalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Feed URL required");
  }
  if (trimmed.startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  throw new Error("Feed URL must be http(s) or webcal://");
}

export function validateWebcalUrl(raw: string): string {
  return validateConnectorHttpsUrl(normalizeWebcalUrl(raw));
}

export function unfoldIcsLines(data: string): string[] {
  const raw = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

export function parseIcalDateTime(value: string): string {
  const trimmed = value.trim();
  if (/^\d{8}T\d{6}Z$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const mo = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    const h = trimmed.slice(9, 11);
    const mi = trimmed.slice(11, 13);
    const s = trimmed.slice(13, 15);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  }
  if (/^\d{8}T\d{6}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6)) - 1;
    const day = Number(trimmed.slice(6, 8));
    const hour = Number(trimmed.slice(9, 11));
    const minute = Number(trimmed.slice(11, 13));
    const second = Number(trimmed.slice(13, 15));
    return new Date(year, month, day, hour, minute, second).toISOString();
  }
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const mo = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return `${y}-${mo}-${d}T00:00:00.000Z`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return trimmed;
}

function parseIcalProperty(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.+)$`, "m"));
  return match?.[1]?.trim();
}

export function unescapeIcalText(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function parseVEventBlock(lines: string[]): CalendarEventSummary | null {
  const block = lines.join("\n");
  const uid = parseIcalProperty(block, "UID");
  const summaryRaw = parseIcalProperty(block, "SUMMARY");
  const dtStart = parseIcalProperty(block, "DTSTART");
  const dtEnd = parseIcalProperty(block, "DTEND");
  if (!uid || !summaryRaw || !dtStart) return null;
  const end = dtEnd ?? dtStart;
  return {
    uid,
    summary: unescapeIcalText(summaryRaw),
    start: parseIcalDateTime(dtStart),
    end: parseIcalDateTime(end),
  };
}

export function parseVEventsFromCalendar(data: string): CalendarEventSummary[] {
  const lines = unfoldIcsLines(data);
  const events: CalendarEventSummary[] = [];
  let inEvent = false;
  let eventLines: string[] = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      eventLines = [line];
      continue;
    }
    if (inEvent) {
      eventLines.push(line);
      if (line === "END:VEVENT") {
        const parsed = parseVEventBlock(eventLines);
        if (parsed) events.push(parsed);
        inEvent = false;
        eventLines = [];
      }
    }
  }
  return events;
}

export async function fetchWebcalFeed(url: string): Promise<string> {
  const normalized = validateWebcalUrl(url);
  const resp = await fetch(normalized, {
    headers: { Accept: "text/calendar, text/plain, */*" },
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`Feed fetch failed (${resp.status})`);
  }
  return resp.text();
}

export async function queryWebcalEvents(
  feeds: Array<{ id: string; url: string }>,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEventSummary[]> {
  const minMs = new Date(timeMin).getTime();
  const maxMs = new Date(timeMax).getTime();
  if (Number.isNaN(minMs) || Number.isNaN(maxMs)) {
    throw new Error("timeMin and timeMax must be valid ISO 8601 dates");
  }
  const all: CalendarEventSummary[] = [];
  const feedBodies = await Promise.all(
    feeds.map(async (feed) => {
      try {
        return { feed, ics: await fetchWebcalFeed(feed.url) };
      } catch {
        return null;
      }
    }),
  );
  for (const row of feedBodies) {
    if (!row) continue;
    const events = parseVEventsFromCalendar(row.ics);
    for (const event of events) {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
      if (endMs >= minMs && startMs <= maxMs) {
        all.push({ ...event, feedId: row.feed.id });
      }
    }
  }
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}
