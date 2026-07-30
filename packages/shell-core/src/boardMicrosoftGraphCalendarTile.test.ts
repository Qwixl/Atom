import { describe, expect, it } from "vitest";
import {
  BOARD_MICROSOFT_CALENDAR_SURFACE_ID,
  buildMicrosoftGraphBoardSurfacePin,
} from "./boardMicrosoftGraphCalendarTile.js";
import { defaultCalendarQueryWindow } from "./boardCalendarTile.js";
import { validateSurfacePin } from "./persistentSurface.js";

describe("buildMicrosoftGraphBoardSurfacePin", () => {
  it("validates as a microsoft-graph-bound board tile with select /events", () => {
    const window = defaultCalendarQueryWindow(new Date("2026-07-30T12:00:00.000Z"));
    const pin = buildMicrosoftGraphBoardSurfacePin(window);
    const result = validateSurfacePin(pin, { entitledConnectors: ["microsoft-graph"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.composition.surfaceId).toBe(BOARD_MICROSOFT_CALENDAR_SURFACE_ID);
    expect(result.value.bindings).toEqual([
      {
        nodeId: "events-table",
        prop: "rows",
        source: {
          connector: "microsoft-graph",
          tool: "listEvents",
          args: window,
        },
        select: "/events",
        format: "table",
        columns: ["start", "subject"],
      },
    ]);
    expect(result.value.refresh?.trigger).toEqual({ type: "interval", everyMinutes: 30 });
    expect(result.value.refresh?.staleAfterSeconds).toBe(900);
  });
});
