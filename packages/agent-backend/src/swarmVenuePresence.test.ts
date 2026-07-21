import { describe, expect, it } from "vitest";
import { hourInTimeZone, isOnHomeShift } from "./swarmVenuePresence.js";

describe("swarmVenuePresence", () => {
  it("computes London hour via Intl", () => {
    // 2026-07-21 10:30 UTC = 11:30 BST
    const d = new Date("2026-07-21T10:30:00.000Z");
    expect(hourInTimeZone(d, "Europe/London")).toBe(11);
  });

  it("treats shift as start inclusive end exclusive", () => {
    const venue = { timezone: "Europe/London" };
    const shift = { startHour: 9, endHour: 17 };
    // 08:30 London (BST = UTC+1) → 07:30 UTC
    expect(isOnHomeShift(new Date("2026-07-21T07:30:00.000Z"), venue, shift).onShift).toBe(false);
    // 09:00 London
    expect(isOnHomeShift(new Date("2026-07-21T08:00:00.000Z"), venue, shift).onShift).toBe(true);
    // 16:59 London
    expect(isOnHomeShift(new Date("2026-07-21T15:59:00.000Z"), venue, shift).onShift).toBe(true);
    // 17:00 London
    expect(isOnHomeShift(new Date("2026-07-21T16:00:00.000Z"), venue, shift).onShift).toBe(false);
  });
});
