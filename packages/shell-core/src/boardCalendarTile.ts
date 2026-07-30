import type { SurfacePin } from "./persistentSurface.js";

/** Canonical surface id for the first-party calendar board tile (PS-06). */
export const BOARD_CALENDAR_SURFACE_ID = "board-cal";

/** Default listEvents window: now through seven days ahead (frozen at pin time). */
export function defaultCalendarQueryWindow(now = new Date()): { timeMin: string; timeMax: string } {
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();
  return { timeMin, timeMax };
}

/**
 * Reference calendar tile the agent can pin via `surface-pin`.
 * Uses webcal `listEvents` with `select: "/events"` (executor returns `{ events }`, not `{ result: { events } }`).
 */
export function buildCalendarBoardSurfacePin(
  window: { timeMin: string; timeMax: string } = defaultCalendarQueryWindow(),
): SurfacePin {
  return {
    composition: {
      version: 1,
      surfaceId: BOARD_CALENDAR_SURFACE_ID,
      intent: "Upcoming calendar",
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
          connector: "webcal",
          tool: "listEvents",
          args: { timeMin: window.timeMin, timeMax: window.timeMax },
        },
        select: "/events",
        format: "table",
      },
    ],
    refresh: {
      trigger: { type: "interval", everyMinutes: 30 },
      staleAfterSeconds: 900,
    },
    placement: { screen: 0, order: 0, size: "m" },
  };
}
