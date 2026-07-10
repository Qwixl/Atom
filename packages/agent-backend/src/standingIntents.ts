/** Standing intents — owner-declared goals the Agent Brain heartbeat evaluates (D077 / BK-42). */

export const STANDING_INTENT_KINDS = ["daily-briefing", "reminder", "watch"] as const;
export type StandingIntentKind = (typeof STANDING_INTENT_KINDS)[number];

export type StandingIntentTrigger =
  | { type: "daily-time"; time: string; timezone?: string }
  | { type: "at"; at: string }
  | { type: "interval"; everyMinutes: number };

export interface StandingIntentScope {
  topics?: string[];
  connectorIds?: string[];
  query?: string;
}

export interface StandingIntentDelivery {
  channel?: "inbox" | "chat" | "push";
  /** Quiet hours as HH:MM local; fires are deferred while inside the window. */
  quietHours?: { start: string; end: string };
}

export interface StandingIntent {
  id: string;
  kind: StandingIntentKind;
  enabled: boolean;
  title: string;
  trigger: StandingIntentTrigger;
  scope?: StandingIntentScope;
  delivery?: StandingIntentDelivery;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pending brain notification queued when an intent fires (BK-43 delivers to shell). */
export interface BrainPendingNotification {
  id: string;
  intentId: string;
  kind: StandingIntentKind;
  title: string;
  body: string;
  createdAt: string;
  deliveredAt?: string | null;
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHhMm(value: string): boolean {
  return HH_MM.test(value.trim());
}

export function parseHhMm(value: string): { hours: number; minutes: number } | null {
  const m = HH_MM.exec(value.trim());
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

export function localHhMm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True when `now` falls inside quiet hours (supports overnight windows). */
export function isInQuietHours(now: Date, quiet?: { start: string; end: string }): boolean {
  if (!quiet) return false;
  const start = parseHhMm(quiet.start);
  const end = parseHhMm(quiet.end);
  if (!start || !end) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = start.hours * 60 + start.minutes;
  const endMins = end.hours * 60 + end.minutes;
  if (startMins === endMins) return false;
  if (startMins < endMins) return mins >= startMins && mins < endMins;
  return mins >= startMins || mins < endMins;
}

export function isStandingIntentKind(value: unknown): value is StandingIntentKind {
  return typeof value === "string" && (STANDING_INTENT_KINDS as readonly string[]).includes(value);
}

export function isStandingIntentTrigger(value: unknown): value is StandingIntentTrigger {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  if (t.type === "daily-time") {
    return typeof t.time === "string" && isValidHhMm(t.time);
  }
  if (t.type === "at") {
    return typeof t.at === "string" && !Number.isNaN(Date.parse(t.at));
  }
  if (t.type === "interval") {
    return typeof t.everyMinutes === "number" && Number.isFinite(t.everyMinutes) && t.everyMinutes >= 1;
  }
  return false;
}

export function isStandingIntent(value: unknown): value is StandingIntent {
  if (!value || typeof value !== "object") return false;
  const i = value as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    i.id.trim().length > 0 &&
    isStandingIntentKind(i.kind) &&
    typeof i.enabled === "boolean" &&
    typeof i.title === "string" &&
    isStandingIntentTrigger(i.trigger) &&
    typeof i.createdAt === "string" &&
    typeof i.updatedAt === "string"
  );
}

export function normalizeStandingIntents(raw: unknown): StandingIntent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStandingIntent);
}

export function createStandingIntentId(): string {
  return `intent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Whether an enabled intent is due to fire at `now`.
 * Quiet hours defer without consuming the fire window for daily-time / at.
 */
export function isIntentDue(intent: StandingIntent, now: Date = new Date()): boolean {
  if (!intent.enabled) return false;
  if (isInQuietHours(now, intent.delivery?.quietHours)) return false;

  const last = intent.lastFiredAt ? Date.parse(intent.lastFiredAt) : NaN;
  const lastValid = Number.isFinite(last) ? last : null;

  switch (intent.trigger.type) {
    case "daily-time": {
      const target = parseHhMm(intent.trigger.time);
      if (!target) return false;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const targetMins = target.hours * 60 + target.minutes;
      if (nowMins < targetMins) return false;
      if (lastValid !== null && localDateKey(new Date(lastValid)) === localDateKey(now)) {
        return false;
      }
      return true;
    }
    case "at": {
      const at = Date.parse(intent.trigger.at);
      if (!Number.isFinite(at) || now.getTime() < at) return false;
      if (lastValid !== null && lastValid >= at) return false;
      return true;
    }
    case "interval": {
      const everyMs = intent.trigger.everyMinutes * 60_000;
      if (lastValid === null) return true;
      return now.getTime() - lastValid >= everyMs;
    }
    default:
      return false;
  }
}

export function listDueIntents(
  intents: readonly StandingIntent[],
  now: Date = new Date(),
): StandingIntent[] {
  return intents.filter((intent) => isIntentDue(intent, now));
}

export function markIntentFired(intent: StandingIntent, firedAt: Date = new Date()): StandingIntent {
  return {
    ...intent,
    lastFiredAt: firedAt.toISOString(),
    updatedAt: firedAt.toISOString(),
  };
}

export function buildFireNotification(
  intent: StandingIntent,
  firedAt: Date = new Date(),
): BrainPendingNotification {
  const body =
    intent.kind === "daily-briefing"
      ? `Your ${intent.title} is ready. Ask me for today's briefing when you're free, or I'll enrich this automatically in a later wave.`
      : intent.kind === "reminder"
        ? intent.title
        : intent.scope?.query
          ? `Watch fired: ${intent.scope.query}`
          : `Watch fired: ${intent.title}`;
  return {
    id: `brain_${firedAt.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    intentId: intent.id,
    kind: intent.kind,
    title: intent.title,
    body,
    createdAt: firedAt.toISOString(),
    deliveredAt: null,
  };
}

export function isBrainPendingNotification(value: unknown): value is BrainPendingNotification {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.intentId === "string" &&
    isStandingIntentKind(n.kind) &&
    typeof n.title === "string" &&
    typeof n.body === "string" &&
    typeof n.createdAt === "string"
  );
}

export function normalizeBrainPendingNotifications(raw: unknown): BrainPendingNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isBrainPendingNotification);
}

export function listUndeliveredNotifications(
  notifications: readonly BrainPendingNotification[],
): BrainPendingNotification[] {
  return notifications.filter((n) => !n.deliveredAt);
}

export function markNotificationsDelivered(
  notifications: readonly BrainPendingNotification[],
  ids: readonly string[],
  deliveredAt: Date = new Date(),
): BrainPendingNotification[] {
  const idSet = new Set(ids);
  const stamp = deliveredAt.toISOString();
  return notifications.map((n) =>
    idSet.has(n.id) && !n.deliveredAt ? { ...n, deliveredAt: stamp } : n,
  );
}
