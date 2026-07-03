import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildICalendarEvent,
  createCalendarEvent,
  discoverEventsCollectionUrl,
  parseVEventFromCalendarData,
  resolveGoogleCalendarAccessToken,
  toIcalUtc,
} from "./googleCalendar.js";

describe("googleCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves access token from env or request", () => {
    expect(resolveGoogleCalendarAccessToken("env_tok", "req_tok")).toBe("req_tok");
    expect(resolveGoogleCalendarAccessToken("env_tok")).toBe("env_tok");
    expect(() => resolveGoogleCalendarAccessToken(null)).toThrow(/not configured/);
  });

  it("formats UTC for iCalendar", () => {
    expect(toIcalUtc("2026-07-03T10:00:00.000Z")).toBe("20260703T100000Z");
  });

  it("builds and parses a VEVENT", () => {
    const ical = buildICalendarEvent({
      uid: "evt-1",
      title: "Standup",
      start: "2026-07-03T10:00:00.000Z",
      end: "2026-07-03T10:30:00.000Z",
      location: "Room 4",
    });
    const parsed = parseVEventFromCalendarData(ical);
    expect(parsed).toMatchObject({
      uid: "evt-1",
      summary: "Standup",
      start: "2026-07-03T10:00:00.000Z",
      end: "2026-07-03T10:30:00.000Z",
    });
  });

  it("discovers events collection URL from userinfo email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("userinfo")) {
          return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const eventsUrl = await discoverEventsCollectionUrl("tok");
    expect(eventsUrl).toBe(
      "https://apidata.googleusercontent.com/caldav/v2/owner%40example.com/events/",
    );
  });

  it("creates event via CalDAV PUT", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("userinfo")) {
        return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
      }
      if (url.includes("/events/") && init?.method === "PUT") {
        expect(init.headers).toMatchObject({
          Authorization: "Bearer tok",
          "Content-Type": "text/calendar; charset=utf-8",
        });
        expect(String(init.body)).toContain("SUMMARY:Planning");
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createCalendarEvent("tok", {
      title: "Planning",
      start: "2026-07-03T14:00:00.000Z",
      end: "2026-07-03T15:00:00.000Z",
    });
    expect(created.uid).toBeTruthy();
    expect(created.href).toContain("/events/");
  });
});
