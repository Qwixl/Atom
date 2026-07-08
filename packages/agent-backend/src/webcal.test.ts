import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeWebcalUrl,
  parseVEventsFromCalendar,
  queryWebcalEvents,
  validateWebcalUrl,
} from "./webcal.js";

describe("webcal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes webcal URLs to https", () => {
    expect(normalizeWebcalUrl("webcal://calendar.example.com/feed.ics")).toBe(
      "https://calendar.example.com/feed.ics",
    );
    expect(validateWebcalUrl("https://calendar.example.com/private.ics")).toBe(
      "https://calendar.example.com/private.ics",
    );
  });

  it("parses multiple VEVENT blocks with folded lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:evt-1",
      "SUMMARY:Standup",
      "DTSTART:20260703T100000Z",
      "DTEND:20260703T103000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-2",
      "SUMMARY:Long title that",
      " continues",
      "DTSTART:20260704T140000Z",
      "DTEND:20260704T150000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEventsFromCalendar(ics);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      uid: "evt-1",
      summary: "Standup",
      start: "2026-07-03T10:00:00.000Z",
      end: "2026-07-03T10:30:00.000Z",
    });
    expect(events[1]?.summary).toBe("Long title thatcontinues");
  });

  it("parses Google-style DTSTART with TZID", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:google-1",
      "SUMMARY:Dinner Time",
      "DTSTART;TZID=Europe/London:20260707T170000",
      "DTEND;TZID=Europe/London:20260707T180000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEventsFromCalendar(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Dinner Time");
    expect(events[0]?.start).toMatch(/2026-07-07T/);
    expect(events[0]?.end).toMatch(/2026-07-07T/);
  });

  it("parses all-day VALUE=DATE events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:allday-1",
      "SUMMARY:Holiday",
      "DTSTART;VALUE=DATE:20260707",
      "DTEND;VALUE=DATE:20260708",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEventsFromCalendar(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.start).toBe("2026-07-07T00:00:00.000Z");
  });

  it("queries events in a time range from feeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "UID:in-range",
            "SUMMARY:Inside",
            "DTSTART:20260703T100000Z",
            "DTEND:20260703T110000Z",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "UID:out-range",
            "SUMMARY:Outside",
            "DTSTART:20260710T100000Z",
            "DTEND:20260710T110000Z",
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n"),
          { status: 200 },
        ),
      ),
    );

    const events = await queryWebcalEvents(
      [{ id: "feed-1", url: "https://example.com/cal.ics" }],
      "2026-07-03T00:00:00.000Z",
      "2026-07-03T23:59:59.000Z",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Inside");
    expect(events[0]?.feedId).toBe("feed-1");
  });
});
