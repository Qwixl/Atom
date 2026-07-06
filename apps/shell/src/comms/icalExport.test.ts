import { describe, expect, it } from "vitest";
import { buildIcsEvent, eventOverlapsSlot } from "./icalExport.js";

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
});
