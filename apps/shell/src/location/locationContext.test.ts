import { describe, expect, it } from "vitest";
import {
  DEVICE_LOCATION_FRESH_MS,
  formatLocationContextForPrompt,
  isDeviceLocationFresh,
} from "./locationContext.js";

describe("locationContext", () => {
  it("isDeviceLocationFresh accepts recent captures", () => {
    const now = Date.parse("2026-07-08T12:00:00.000Z");
    const snapshot = {
      latitude: 52.5,
      longitude: 13.4,
      capturedAt: "2026-07-08T11:30:00.000Z",
    };
    expect(isDeviceLocationFresh(snapshot, now)).toBe(true);
  });

  it("isDeviceLocationFresh rejects stale captures", () => {
    const now = Date.parse("2026-07-08T12:00:00.000Z");
    const snapshot = {
      latitude: 52.5,
      longitude: 13.4,
      capturedAt: new Date(now - DEVICE_LOCATION_FRESH_MS - 1).toISOString(),
    };
    expect(isDeviceLocationFresh(snapshot, now)).toBe(false);
  });

  it("formatLocationContextForPrompt prefers fresh device fix guidance", () => {
    const now = Date.parse("2026-07-08T12:00:00.000Z");
    const text = formatLocationContextForPrompt(
      { homeCity: "Berlin" },
      { latitude: 48.13, longitude: 11.58, capturedAt: "2026-07-08T11:55:00.000Z" },
      now,
    );
    expect(text).toContain("Home location (owner-declared): Berlin");
    expect(text).toContain("One-shot device location");
    expect(text).toContain("input.latitude + input.longitude");
  });

  it("formatLocationContextForPrompt omits expired device fix", () => {
    const now = Date.parse("2026-07-08T12:00:00.000Z");
    const text = formatLocationContextForPrompt(
      { homeCity: "Berlin" },
      { latitude: 48.13, longitude: 11.58, capturedAt: "2026-07-08T08:00:00.000Z" },
      now,
    );
    expect(text).toContain("expired");
    expect(text).not.toContain("latitude 48.13000");
  });
});
