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
  try {
    const status = await client.invokeConnector("webcal", "getStatus", {});
    const connected = Boolean((status.result as { connected?: boolean }).connected);
    if (!connected) return [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const listed = await client.invokeConnector("webcal", "listEvents", {
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
    });
    const events = (listed.result as { events?: WebcalBusyEvent[] }).events ?? [];
    return events.filter(
      (event) =>
        typeof event.start === "string" &&
        typeof event.end === "string" &&
        typeof event.summary === "string",
    );
  } catch {
    return [];
  }
}
