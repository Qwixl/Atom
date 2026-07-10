import { describe, expect, it } from "vitest";
import {
  buildFireNotification,
  isInQuietHours,
  isIntentDue,
  isStandingIntent,
  listDueIntents,
  listUndeliveredNotifications,
  markIntentFired,
  markNotificationsDelivered,
  type StandingIntent,
} from "./standingIntents.js";
import { coerceStandingIntents } from "./brainAdmin.js";

function baseIntent(overrides: Partial<StandingIntent> = {}): StandingIntent {
  return {
    id: "intent_1",
    kind: "reminder",
    enabled: true,
    title: "Test",
    trigger: { type: "at", at: "2026-07-10T10:00:00.000Z" },
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
    ...overrides,
  };
}

describe("standingIntents", () => {
  it("validates standing intent shape", () => {
    expect(isStandingIntent(baseIntent())).toBe(true);
    expect(isStandingIntent({ ...baseIntent(), kind: "nope" })).toBe(false);
  });

  it("fires daily-time once per local day after target time", () => {
    const intent = baseIntent({
      kind: "daily-briefing",
      title: "Morning",
      trigger: { type: "daily-time", time: "08:00" },
    });
    const morning = new Date(2026, 6, 10, 8, 5, 0);
    expect(isIntentDue(intent, morning)).toBe(true);
    const fired = markIntentFired(intent, morning);
    expect(isIntentDue(fired, new Date(2026, 6, 10, 18, 0, 0))).toBe(false);
    expect(isIntentDue(fired, new Date(2026, 6, 11, 8, 1, 0))).toBe(true);
  });

  it("fires at-trigger once after deadline", () => {
    const intent = baseIntent({
      trigger: { type: "at", at: "2026-07-10T12:00:00.000Z" },
    });
    expect(isIntentDue(intent, new Date("2026-07-10T11:59:00.000Z"))).toBe(false);
    expect(isIntentDue(intent, new Date("2026-07-10T12:00:00.000Z"))).toBe(true);
    const fired = markIntentFired(intent, new Date("2026-07-10T12:00:00.000Z"));
    expect(isIntentDue(fired, new Date("2026-07-10T13:00:00.000Z"))).toBe(false);
  });

  it("fires interval after everyMinutes", () => {
    const intent = baseIntent({
      kind: "watch",
      trigger: { type: "interval", everyMinutes: 30 },
      lastFiredAt: "2026-07-10T10:00:00.000Z",
    });
    expect(isIntentDue(intent, new Date("2026-07-10T10:20:00.000Z"))).toBe(false);
    expect(isIntentDue(intent, new Date("2026-07-10T10:30:00.000Z"))).toBe(true);
  });

  it("defers during quiet hours", () => {
    const intent = baseIntent({
      trigger: { type: "interval", everyMinutes: 1 },
      delivery: { quietHours: { start: "22:00", end: "07:00" } },
    });
    expect(isInQuietHours(new Date(2026, 6, 10, 23, 0, 0), intent.delivery?.quietHours)).toBe(true);
    expect(isIntentDue(intent, new Date(2026, 6, 10, 23, 0, 0))).toBe(false);
    expect(isIntentDue(intent, new Date(2026, 6, 10, 8, 0, 0))).toBe(true);
  });

  it("listDueIntents filters enabled only", () => {
    const due = listDueIntents(
      [
        baseIntent({ id: "a", enabled: false, trigger: { type: "interval", everyMinutes: 1 } }),
        baseIntent({ id: "b", trigger: { type: "interval", everyMinutes: 1 } }),
      ],
      new Date("2026-07-10T12:00:00.000Z"),
    );
    expect(due.map((i) => i.id)).toEqual(["b"]);
  });

  it("buildFireNotification carries intent metadata", () => {
    const n = buildFireNotification(baseIntent({ kind: "daily-briefing", title: "Briefing" }));
    expect(n.intentId).toBe("intent_1");
    expect(n.kind).toBe("daily-briefing");
    expect(n.title).toBe("Briefing");
    expect(n.body.length).toBeGreaterThan(0);
  });
});

describe("coerceStandingIntents", () => {
  it("fills ids and timestamps for partial payloads", () => {
    const coerced = coerceStandingIntents([
      {
        kind: "daily-briefing",
        title: "Morning briefing",
        trigger: { type: "daily-time", time: "07:30" },
        scope: { topics: ["tech"] },
      },
    ]);
    expect(coerced).not.toBeNull();
    expect(coerced).toHaveLength(1);
    const first = coerced![0]!;
    expect(first.id.startsWith("intent_")).toBe(true);
    expect(first.enabled).toBe(true);
    expect(first.scope?.topics).toEqual(["tech"]);
  });

  it("rejects invalid kinds", () => {
    expect(coerceStandingIntents([{ kind: "x", title: "t", trigger: { type: "interval", everyMinutes: 1 } }])).toBeNull();
  });
});

describe("markNotificationsDelivered", () => {
  it("stamps deliveredAt only for matching undelivered ids", () => {
    const a = buildFireNotification(baseIntent({ id: "i1", kind: "reminder", title: "A" }));
    const b = buildFireNotification(baseIntent({ id: "i2", kind: "watch", title: "B" }));
    const stamped = markNotificationsDelivered([a, b], [a.id], new Date("2026-07-10T12:00:00.000Z"));
    expect(stamped[0]!.deliveredAt).toBe("2026-07-10T12:00:00.000Z");
    expect(stamped[1]!.deliveredAt).toBeFalsy();
    expect(listUndeliveredNotifications(stamped).map((n) => n.id)).toEqual([b.id]);
  });
});
