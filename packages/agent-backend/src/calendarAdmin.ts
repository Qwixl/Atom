import type { Express } from "express";
import {
  createCalendarEvent,
  queryCalendarEvents,
  resolveGoogleCalendarAccessToken,
} from "./googleCalendar.js";

export interface CalendarAdminConfig {
  googleCalendarAccessToken: string | null;
}

export function registerCalendarAdminRoutes(
  adminApp: Express,
  config: CalendarAdminConfig,
): void {
  adminApp.get("/calendar/status", (_req, res) => {
    res.json({
      configured: Boolean(config.googleCalendarAccessToken?.trim()),
      protocol: "caldav",
      provider: "google",
    });
  });

  adminApp.post("/calendar/query", async (req, res) => {
    const body = req.body as { timeMin?: string; timeMax?: string; accessToken?: string };
    if (!body.timeMin?.trim() || !body.timeMax?.trim()) {
      res.status(400).json({ error: "timeMin and timeMax required (ISO 8601)" });
      return;
    }
    try {
      const accessToken = resolveGoogleCalendarAccessToken(
        config.googleCalendarAccessToken,
        body.accessToken,
      );
      const events = await queryCalendarEvents(
        accessToken,
        body.timeMin.trim(),
        body.timeMax.trim(),
      );
      res.json({ events });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/calendar/events", async (req, res) => {
    const body = req.body as {
      title?: string;
      start?: string;
      end?: string;
      location?: string;
      description?: string;
      accessToken?: string;
    };
    if (!body.title?.trim() || !body.start?.trim() || !body.end?.trim()) {
      res.status(400).json({ error: "title, start, and end required (ISO 8601)" });
      return;
    }
    try {
      const accessToken = resolveGoogleCalendarAccessToken(
        config.googleCalendarAccessToken,
        body.accessToken,
      );
      const created = await createCalendarEvent(accessToken, {
        title: body.title.trim(),
        start: body.start.trim(),
        end: body.end.trim(),
        location: body.location?.trim() || undefined,
        description: body.description?.trim() || undefined,
      });
      res.json({ created });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
