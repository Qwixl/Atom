import { describe, expect, it } from "vitest";
import {
  BOARD_CALENDAR_SURFACE_ID,
  buildCalendarBoardSurfacePin,
  defaultCalendarQueryWindow,
} from "./boardCalendarTile.js";
import { validateSurfacePin } from "./persistentSurface.js";

describe("buildCalendarBoardSurfacePin", () => {
  it("validates as a webcal-bound board tile with select /events", () => {
    const window = defaultCalendarQueryWindow(new Date("2026-07-30T12:00:00.000Z"));
    const pin = buildCalendarBoardSurfacePin(window);
    const result = validateSurfacePin(pin, { entitledConnectors: ["webcal"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.composition.surfaceId).toBe(BOARD_CALENDAR_SURFACE_ID);
    expect(result.value.bindings).toEqual([
      {
        nodeId: "events-table",
        prop: "rows",
        source: {
          connector: "webcal",
          tool: "listEvents",
          args: window,
        },
        select: "/events",
        format: "table",
      },
    ]);
    expect(result.value.refresh?.trigger).toEqual({ type: "interval", everyMinutes: 30 });
    expect(result.value.refresh?.staleAfterSeconds).toBe(900);
  });
});
