import type { SchedulingSlot } from "@qwixl/a2a-transport";
import type { CommsAgentClient } from "./client.js";
import type { CommsThreadItem } from "./types.js";

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

export function buildIcsEvent(opts: {
  uid: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
}): string {
  const stamp = formatIcsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atom//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
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
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcsFile(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function resolveAcceptedSchedulingSlot(
  thread: CommsThreadItem[],
  response: Extract<CommsThreadItem, { kind: "scheduling-response" }>,
): { title: string; slot: SchedulingSlot } | null {
  if (response.response !== "accept" || !response.slotId) return null;
  const proposal = thread.find(
    (item): item is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
      item.kind === "scheduling-proposal" && item.id === response.proposalId,
  );
  if (!proposal) return null;
  const slot = proposal.slots.find((entry) => entry.id === response.slotId);
  if (!slot?.start || !slot.end) return null;
  return { title: proposal.title, slot };
}

export function exportAcceptedSchedulingToIcs(
  thread: CommsThreadItem[],
  response: Extract<CommsThreadItem, { kind: "scheduling-response" }>,
): boolean {
  const resolved = resolveAcceptedSchedulingSlot(thread, response);
  if (!resolved) return false;
  const ics = buildIcsEvent({
    uid: `${response.proposalId}-${response.slotId}@atom.qwixl.dev`,
    summary: resolved.title,
    description: "Scheduled via Atom",
    start: resolved.slot.start,
    end: resolved.slot.end,
  });
  const safeName = resolved.title.replace(/[^\w\s-]/g, "").trim() || "meeting";
  downloadIcsFile(`${safeName}.ics`, ics);
  return true;
}

export function eventOverlapsSlot(
  event: { start: string; end: string },
  slot: { start: string; end: string },
): boolean {
  const slotStart = new Date(slot.start).getTime();
  const slotEnd = new Date(slot.end).getTime();
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();
  if ([slotStart, slotEnd, eventStart, eventEnd].some(Number.isNaN)) return false;
  return eventStart < slotEnd && eventEnd > slotStart;
}

export interface WebcalBusyEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
}

export async function loadWebcalBusyEvents(client: CommsAgentClient): Promise<WebcalBusyEvent[]> {
  const start = new Date();
  const horizon = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return loadWebcalEvents(client, start, horizon);
}

export async function loadWebcalEvents(
  client: CommsAgentClient,
  timeMin: Date,
  timeMax: Date,
  opts?: { throwOnError?: boolean },
): Promise<WebcalBusyEvent[]> {
  try {
    const status = await client.invokeConnector("webcal", "getStatus", {});
    const connected = Boolean((status.result as { connected?: boolean }).connected);
    if (!connected) return [];
    const listed = await client.invokeConnector("webcal", "listEvents", {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });
    const events = (listed.result as { events?: WebcalBusyEvent[] }).events ?? [];
    return events.filter(
      (event) =>
        typeof event.start === "string" &&
        typeof event.end === "string" &&
        typeof event.summary === "string",
    );
  } catch (error) {
    if (opts?.throwOnError) throw error;
    return [];
  }
}

export async function isWebcalConnected(client: CommsAgentClient): Promise<boolean> {
  try {
    const status = await client.invokeConnector("webcal", "getStatus", {});
    return Boolean((status.result as { connected?: boolean }).connected);
  } catch {
    return false;
  }
}

function formatEventLine(event: WebcalBusyEvent): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const range =
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? `${event.start} – ${event.end}`
      : `${start.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })} – ${end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  return `- ${event.summary}: ${range}`;
}

export function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Split feed events into today (local date / still in progress) vs later days. */
export function partitionEventsByToday(
  events: WebcalBusyEvent[],
  now = new Date(),
): { todayEvents: WebcalBusyEvent[]; upcomingEvents: WebcalBusyEvent[] } {
  const todayEvents: WebcalBusyEvent[] = [];
  const upcomingEvents: WebcalBusyEvent[] = [];
  const nowMs = now.getTime();
  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime())) continue;
    const endMs = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    // Still happening (started earlier, not finished) counts as today for briefing.
    if (start.getTime() <= nowMs && endMs > nowMs) {
      todayEvents.push(event);
      continue;
    }
    if (isSameLocalCalendarDay(start, now)) {
      todayEvents.push(event);
    } else if (start.getTime() > nowMs) {
      upcomingEvents.push(event);
    }
  }
  todayEvents.sort((a, b) => a.start.localeCompare(b.start));
  upcomingEvents.sort((a, b) => a.start.localeCompare(b.start));
  return { todayEvents, upcomingEvents };
}

/** Agent-readable calendar snapshot for the system prompt. */
export function formatCalendarContextForPrompt(opts: {
  connected: boolean;
  todayEvents: WebcalBusyEvent[];
  upcomingEvents: WebcalBusyEvent[];
  error?: string;
}): string {
  if (opts.error) {
    return `Feed read failed: ${opts.error}. Owner can check Settings → Connectors.`;
  }
  if (!opts.connected) {
    return "Not connected. Owner can add a private ICS feed URL in Settings → Connectors.";
  }
  const today = opts.todayEvents.map(formatEventLine);
  const upcoming = opts.upcomingEvents
    .filter((event) => !opts.todayEvents.some((todayEvent) => todayEvent.uid === event.uid))
    .slice(0, 12)
    .map(formatEventLine);
  const lines = [
    "Connected (read-only via WebCal). Atom cannot create or edit Google Calendar events via API.",
    today.length > 0 ? `Today:\n${today.join("\n")}` : "Today: no events in feed.",
    upcoming.length > 0
      ? `Upcoming:\n${upcoming.join("\n")}`
      : "Upcoming: none in the next 7 days.",
    today.length > 0 || upcoming.length > 0
      ? "When the owner asks about their schedule, you MUST list every line above that answers their question — in text and/or core/list. Never reply with only a heading."
      : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}
