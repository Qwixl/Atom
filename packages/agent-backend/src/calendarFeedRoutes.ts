import type { Express, Request, Response } from "express";
import type { CalendarFeedStore } from "./calendarFeedStore.js";
import type { DataObjectInbox } from "./inbox.js";

export interface CalendarFeedRouteDeps {
  publicBaseUrl: string;
  calendarFeed: CalendarFeedStore;
  inbox: DataObjectInbox;
}

function feedUrl(publicBaseUrl: string, token: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/calendar/feed.ics?token=${encodeURIComponent(token)}`;
}

function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https:\/\//i, "webcal://").replace(/^http:\/\//i, "webcal://");
}

export function registerCalendarFeedPublicRoutes(app: Express, deps: CalendarFeedRouteDeps): void {
  app.get("/calendar/feed.ics", (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!deps.calendarFeed.verifyToken(token)) {
      res.status(401).type("text/plain").send("Invalid or missing feed token");
      return;
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(deps.calendarFeed.buildFeedIcs());
  });
}

export function registerCalendarFeedAdminRoutes(app: Express, deps: CalendarFeedRouteDeps): void {
  app.get("/calendar/feed", (_req, res) => {
    const token = deps.calendarFeed.getToken();
    const url = feedUrl(deps.publicBaseUrl, token);
    res.json({
      eventCount: deps.calendarFeed.acceptedCount(),
      feedUrl: url,
      webcalUrl: webcalUrl(url),
      tokenHint: deps.calendarFeed.feedTokenHint(),
    });
  });

  app.post("/calendar/feed/rotate-token", (_req, res) => {
    const token = deps.calendarFeed.rotateToken();
    const url = feedUrl(deps.publicBaseUrl, token);
    res.json({
      eventCount: deps.calendarFeed.acceptedCount(),
      feedUrl: url,
      webcalUrl: webcalUrl(url),
      tokenHint: deps.calendarFeed.feedTokenHint(),
    });
  });

  app.post("/calendar/feed/sync-inbox", (_req, res) => {
    const added = deps.calendarFeed.syncFromInbox(deps.inbox.list());
    res.json({ added, eventCount: deps.calendarFeed.acceptedCount() });
  });
}

export function handleCalendarFeedInboxObject(
  calendarFeed: CalendarFeedStore,
  object: import("@qwixl/protocol").DataObject,
): void {
  calendarFeed.ingestInboxObject(object);
}
