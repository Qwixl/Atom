import type { Express } from "express";
import type { ConnectorVault } from "./connectorVault.js";
import type { BrainScheduler } from "./brainScheduler.js";
import {
  createStandingIntentId,
  isStandingIntent,
  isStandingIntentKind,
  isStandingIntentTrigger,
  listUndeliveredNotifications,
  markNotificationsDelivered,
  normalizeBrainPendingNotifications,
  normalizeStandingIntents,
  type StandingIntent,
  type StandingIntentDelivery,
  type StandingIntentKind,
  type StandingIntentScope,
  type StandingIntentTrigger,
} from "./standingIntents.js";

export interface BrainAdminDeps {
  vault: ConnectorVault;
  scheduler: BrainScheduler;
}

function coerceTrigger(raw: unknown): StandingIntentTrigger | null {
  if (!isStandingIntentTrigger(raw)) return null;
  return raw;
}

function coerceScope(raw: unknown): StandingIntentScope | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  const topics = Array.isArray(s.topics)
    ? s.topics.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : undefined;
  const connectorIds = Array.isArray(s.connectorIds)
    ? s.connectorIds.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : undefined;
  const query = typeof s.query === "string" ? s.query.trim() : undefined;
  if (!topics?.length && !connectorIds?.length && !query) return undefined;
  return { topics, connectorIds, query };
}

function coerceDelivery(raw: unknown): StandingIntentDelivery | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const channel =
    d.channel === "inbox" || d.channel === "chat" || d.channel === "push" ? d.channel : undefined;
  let quietHours: { start: string; end: string } | undefined;
  if (d.quietHours && typeof d.quietHours === "object") {
    const q = d.quietHours as Record<string, unknown>;
    if (typeof q.start === "string" && typeof q.end === "string") {
      quietHours = { start: q.start.trim(), end: q.end.trim() };
    }
  }
  if (!channel && !quietHours) return undefined;
  return { channel, quietHours };
}

/** Accept partial client payloads and fill ids/timestamps. */
export function coerceStandingIntents(raw: unknown): StandingIntent[] | null {
  if (!Array.isArray(raw)) return null;
  const now = new Date().toISOString();
  const out: StandingIntent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (!isStandingIntentKind(r.kind)) return null;
    const trigger = coerceTrigger(r.trigger);
    if (!trigger) return null;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title) return null;
    const id =
      typeof r.id === "string" && r.id.trim() ? r.id.trim() : createStandingIntentId();
    const createdAt = typeof r.createdAt === "string" ? r.createdAt : now;
    const updatedAt = typeof r.updatedAt === "string" ? r.updatedAt : now;
    const intent: StandingIntent = {
      id,
      kind: r.kind as StandingIntentKind,
      enabled: r.enabled !== false,
      title,
      trigger,
      scope: coerceScope(r.scope),
      delivery: coerceDelivery(r.delivery),
      lastFiredAt:
        r.lastFiredAt === null
          ? null
          : typeof r.lastFiredAt === "string"
            ? r.lastFiredAt
            : null,
      createdAt,
      updatedAt,
    };
    if (!isStandingIntent(intent)) return null;
    out.push(intent);
  }
  return out;
}

export function registerBrainAdminRoutes(app: Express, deps: BrainAdminDeps): void {
  app.get("/brain/status", (_req, res) => {
    res.json({ ok: true, ...deps.scheduler.getStatus() });
  });

  app.get("/brain/intents", (_req, res) => {
    res.json({ intents: normalizeStandingIntents(deps.vault.getStandingIntents()) });
  });

  app.put("/brain/intents", async (req, res) => {
    const body = req.body as { intents?: unknown };
    const coerced = coerceStandingIntents(body.intents);
    if (!coerced) {
      res.status(400).json({ error: "intents array of valid standing intents required" });
      return;
    }
    await deps.vault.setStandingIntents(coerced);
    res.json({ ok: true, intents: coerced });
  });

  app.get("/brain/pending", (req, res) => {
    const all = normalizeBrainPendingNotifications(deps.vault.getBrainPendingNotifications());
    const undeliveredOnly =
      req.query.undelivered === "1" ||
      req.query.undelivered === "true" ||
      req.query.undelivered === "";
    res.json({
      notifications: undeliveredOnly ? listUndeliveredNotifications(all) : all,
    });
  });

  app.post("/brain/pending/delivered", async (req, res) => {
    const body = req.body as { ids?: unknown };
    if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string" && id.trim())) {
      res.status(400).json({ error: "ids string array required" });
      return;
    }
    const ids = body.ids.map((id) => String(id).trim()).filter(Boolean);
    const existing = normalizeBrainPendingNotifications(deps.vault.getBrainPendingNotifications());
    const next = markNotificationsDelivered(existing, ids);
    await deps.vault.setBrainPendingNotifications(next);
    res.json({
      ok: true,
      delivered: ids.length,
      pending: listUndeliveredNotifications(next).length,
    });
  });

  app.post("/brain/tick", async (_req, res) => {
    const result = await deps.scheduler.tick();
    res.json({
      ok: true,
      fired: result.fired.map((i) => i.id),
      notifications: result.notifications,
    });
  });

  /** Class C / Police → founder inject (AS-08). Admin bearer required (same as other brain routes). */
  app.post("/brain/pending/inject", async (req, res) => {
    const body = req.body as { notification?: unknown };
    const n = body.notification;
    if (!n || typeof n !== "object") {
      res.status(400).json({ error: "notification object required" });
      return;
    }
    const r = n as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `inject-${Date.now()}`;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const notificationBody = typeof r.body === "string" ? r.body.trim() : "";
    if (!title || !notificationBody) {
      res.status(400).json({ error: "notification.title and notification.body required" });
      return;
    }
    const kind =
      r.kind === "daily-briefing" || r.kind === "reminder" || r.kind === "watch"
        ? r.kind
        : "watch";
    const entry = {
      id,
      intentId: typeof r.intentId === "string" ? r.intentId : `inject-${id}`,
      kind,
      title,
      body: notificationBody,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    };
    const existing = normalizeBrainPendingNotifications(deps.vault.getBrainPendingNotifications());
    await deps.vault.setBrainPendingNotifications([...existing, entry].slice(-100));
    res.json({ ok: true, notification: entry });
  });
}
