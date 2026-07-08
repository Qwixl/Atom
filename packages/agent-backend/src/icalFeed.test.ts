import { describe, expect, it } from "vitest";
import { buildIcsCalendar, buildIcsEvent } from "./icalFeed.js";

describe("icalFeed", () => {
  it("builds a single VEVENT with escaped text", () => {
    const ics = buildIcsEvent({
      uid: "proposal-slot",
      summary: "Team sync; notes, etc.",
      description: "Line one\nLine two",
      start: "2026-07-08T10:00:00.000Z",
      end: "2026-07-08T10:30:00.000Z",
    });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:proposal-slot");
    expect(ics).toContain("SUMMARY:Team sync\\; notes\\, etc.");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("DTSTART:20260708T100000Z");
    expect(ics).toContain("DTEND:20260708T103000Z");
  });

  it("builds a publish VCALENDAR with multiple events", () => {
    const ics = buildIcsCalendar([
      {
        uid: "a",
        summary: "One",
        start: "2026-07-08T10:00:00.000Z",
        end: "2026-07-08T10:30:00.000Z",
      },
      {
        uid: "b",
        summary: "Two",
        start: "2026-07-09T14:00:00.000Z",
        end: "2026-07-09T15:00:00.000Z",
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("PRODID:-//Atom//AcceptedMeetings//EN");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
