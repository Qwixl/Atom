import { describe, expect, it } from "vitest";
import {
  formatCalDavTimeRange,
  normalizeCalDavCalendarUrl,
  parseCalendarDataFromMultistatus,
  parseCalendarsFromPropfind,
} from "./caldavHttp.js";

describe("caldavHttp", () => {
  it("normalizes calendar URL trailing slash", () => {
    expect(normalizeCalDavCalendarUrl("https://caldav.example.com/user/Calendar")).toBe(
      "https://caldav.example.com/user/Calendar/",
    );
  });

  it("formats ISO dates for CalDAV time-range", () => {
    expect(formatCalDavTimeRange("2026-07-08T12:00:00.000Z")).toBe("20260708T120000Z");
  });

  it("parses calendar-data from multistatus", () => {
    const xml = `<?xml version="1.0"?>
<multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1@test
SUMMARY:Standup
DTSTART:20260708T090000Z
DTEND:20260708T093000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </response>
</multistatus>`;
    const chunks = parseCalendarDataFromMultistatus(xml);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("SUMMARY:Standup");
  });

  it("parses calendars from PROPFIND", () => {
    const xml = `<multistatus xmlns:D="DAV:">
      <response><href>/calendars/user/work/</href><displayname>Work</displayname></response>
    </multistatus>`;
    const calendars = parseCalendarsFromPropfind(xml);
    expect(calendars[0]).toMatchObject({ href: "/calendars/user/work/", name: "Work" });
  });
});
