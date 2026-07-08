import { describe, expect, it } from "vitest";
import { buildIcsEvent, eventOverlapsSlot, formatCalendarContextForPrompt, partitionEventsByToday } from "./icalExport.js";

describe("icalExport", () => {
  it("builds a minimal VEVENT block", () => {
    const ics = buildIcsEvent({
      uid: "test@atom.qwixl.dev",
      summary: "Standup",
      start: "2026-07-07T09:00:00.000Z",
      end: "2026-07-07T09:30:00.000Z",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Standup");
    expect(ics).toContain("DTSTART:20260707T090000Z");
    expect(ics).toContain("DTEND:20260707T093000Z");
  });

  it("detects overlapping events", () => {
    expect(
      eventOverlapsSlot(
        { start: "2026-07-07T09:00:00.000Z", end: "2026-07-07T10:00:00.000Z" },
        { start: "2026-07-07T09:30:00.000Z", end: "2026-07-07T10:00:00.000Z" },
      ),
    ).toBe(true);
    expect(
      eventOverlapsSlot(
        { start: "2026-07-07T09:00:00.000Z", end: "2026-07-07T09:30:00.000Z" },
        { start: "2026-07-07T10:00:00.000Z", end: "2026-07-07T11:00:00.000Z" },
      ),
    ).toBe(false);
  });

  it("formats feed read errors for the agent prompt", () => {
    const text = formatCalendarContextForPrompt({
      connected: false,
      todayEvents: [],
      upcomingEvents: [],
      error: "Feed fetch failed (403)",
    });
    expect(text).toContain("Feed read failed");
    expect(text).toContain("403");
  });

  it("partitions events into today vs upcoming by local date", () => {
    const now = new Date("2026-07-07T17:00:00");
    const { todayEvents, upcomingEvents } = partitionEventsByToday(
      [
        {
          uid: "1",
          summary: "Tonight",
          start: "2026-07-07T20:00:00.000Z",
          end: "2026-07-07T21:00:00.000Z",
        },
        {
          uid: "2",
          summary: "Tomorrow",
          start: "2026-07-08T09:00:00.000Z",
          end: "2026-07-08T10:00:00.000Z",
        },
      ],
      now,
    );
    expect(todayEvents.map((event) => event.summary)).toEqual(["Tonight"]);
    expect(upcomingEvents.map((event) => event.summary)).toEqual(["Tomorrow"]);
  });
});
