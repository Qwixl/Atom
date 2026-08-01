import type { SurfacePin } from "./persistentSurface.js";
import { defaultCalendarQueryWindow } from "./boardCalendarTile.js";

/** Canonical surface id for the Microsoft Graph calendar board tile (PS-10). */
export const BOARD_MICROSOFT_CALENDAR_SURFACE_ID = "board-ms-cal";

/**
 * Reference Microsoft 365 calendar tile the agent can pin via `surface-pin`.
 * Uses `microsoft-graph` `listEvents` with `select: "/events"` (executor returns `{ events }`).
 */
export function buildMicrosoftGraphBoardSurfacePin(
  window: { timeMin: string; timeMax: string } = defaultCalendarQueryWindow(),
): SurfacePin {
  return {
    composition: {
      version: 1,
      surfaceId: BOARD_MICROSOFT_CALENDAR_SURFACE_ID,
      intent: "Upcoming Microsoft 365 calendar",
      root: {
        id: "events-table",
        component: "core/table",
        props: {
          columns: ["When", "Event"],
          rows: [],
        },
      },
    },
    bindings: [
      {
        nodeId: "events-table",
        prop: "rows",
        source: {
          connector: "microsoft-graph",
          tool: "listEvents",
          args: { timeMin: window.timeMin, timeMax: window.timeMax },
        },
        select: "/events",
        format: "table",
        columns: ["start", "subject"],
      },
    ],
    refresh: {
      trigger: { type: "interval", everyMinutes: 30 },
      staleAfterSeconds: 900,
    },
    placement: { screen: 0, order: 0, size: "m" },
  };
}
