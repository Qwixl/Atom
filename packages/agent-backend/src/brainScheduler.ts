import type { ConnectorVault } from "./connectorVault.js";
import {
  buildFireNotification,
  isStandingIntent,
  listDueIntents,
  markIntentFired,
  normalizeBrainPendingNotifications,
  normalizeStandingIntents,
  type BrainPendingNotification,
  type StandingIntent,
} from "./standingIntents.js";
import { normalizePushSubscriptions } from "./push/types.js";
import { loadPushSenderConfig, sendBrainPushNotifications } from "./push/sendPush.js";

export interface BrainSchedulerOptions {
  vault: ConnectorVault;
  /** Tick interval in ms (default 60s). */
  intervalMs?: number;
  /**
   * When false, scheduler still runs but only evaluates intents if at least one
   * is enabled — used for free-tier duty-cycle later (BK-45). Default true.
   */
  alwaysOn?: boolean;
  /** D087 — ATOM_KILL_SWITCH pauses all ticks (swarm + owner). */
  killSwitch?: boolean;
  /** Injected clock for tests. */
  now?: () => Date;
  onFire?: (intent: StandingIntent, notification: BrainPendingNotification) => void;
  /**
   * Optional brain-turn runner (BK-44). When set, produces the notification body
   * (LLM fan-out). Return null to skip queueing (e.g. watch with nothing to report).
   */
  resolveNotification?: (
    intent: StandingIntent,
    firedAt: Date,
  ) => Promise<BrainPendingNotification | null>;
}

export class BrainScheduler {
  private readonly vault: ConnectorVault;
  private readonly intervalMs: number;
  private readonly alwaysOn: boolean;
  private readonly killSwitch: boolean;
  private readonly now: () => Date;
  private readonly onFire?: (intent: StandingIntent, notification: BrainPendingNotification) => void;
  private readonly resolveNotification?: (
    intent: StandingIntent,
    firedAt: Date,
  ) => Promise<BrainPendingNotification | null>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastTickAt: string | null = null;
  private lastFireCount = 0;

  constructor(options: BrainSchedulerOptions) {
    this.vault = options.vault;
    this.intervalMs = Math.max(5_000, options.intervalMs ?? 60_000);
    this.alwaysOn = options.alwaysOn !== false;
    this.killSwitch = options.killSwitch === true;
    this.now = options.now ?? (() => new Date());
    this.onFire = options.onFire;
    this.resolveNotification = options.resolveNotification;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // Run once soon after start so daily-time intents near boot are not delayed a full interval.
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): {
    running: boolean;
    alwaysOn: boolean;
    killSwitch: boolean;
    intervalMs: number;
    lastTickAt: string | null;
    lastFireCount: number;
    intentCount: number;
    pendingCount: number;
  } {
    return {
      running: this.timer !== null,
      alwaysOn: this.alwaysOn,
      killSwitch: this.killSwitch,
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt,
      lastFireCount: this.lastFireCount,
      intentCount: normalizeStandingIntents(this.vault.getStandingIntents()).length,
      pendingCount: this.vault.getBrainPendingNotifications().length,
    };
  }

  /** Evaluate due intents once. Safe to call from tests without start(). */
  async tick(): Promise<{ fired: StandingIntent[]; notifications: BrainPendingNotification[] }> {
    if (this.ticking) return { fired: [], notifications: [] };
    this.ticking = true;
    try {
      const now = this.now();
      this.lastTickAt = now.toISOString();
      if (this.killSwitch || !this.alwaysOn) {
        this.lastFireCount = 0;
        return { fired: [], notifications: [] };
      }

      const intents = normalizeStandingIntents(this.vault.getStandingIntents());
      const due = listDueIntents(intents, now);
      if (due.length === 0) {
        this.lastFireCount = 0;
        return { fired: [], notifications: [] };
      }

      const fired: StandingIntent[] = [];
      const notifications: BrainPendingNotification[] = [];
      const byId = new Map(intents.map((i) => [i.id, i]));

      for (const intent of due) {
        const updated = markIntentFired(intent, now);
        byId.set(intent.id, updated);
        fired.push(updated);

        let notification: BrainPendingNotification | null = null;
        if (this.resolveNotification) {
          try {
            notification = await this.resolveNotification(updated, now);
          } catch (error) {
            console.warn(
              `[brain] resolveNotification failed for ${intent.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            notification = buildFireNotification(updated, now);
          }
        } else {
          notification = buildFireNotification(updated, now);
        }

        if (notification) {
          notifications.push(notification);
          this.onFire?.(updated, notification);
          const channel = updated.delivery?.channel;
          const shouldPush = channel === "push" || channel === undefined;
          if (shouldPush) {
            const subs = normalizePushSubscriptions(this.vault.getPushSubscriptions());
            if (subs.length > 0) {
              void sendBrainPushNotifications(subs, notification, loadPushSenderConfig()).then(
                (result) => {
                  if (result.failed > 0) {
                    console.warn(
                      `[brain] push send partial failure for ${intent.id}: ${result.errors.join("; ")}`,
                    );
                  }
                },
              );
            }
          }
        }
      }

      const nextIntents = [...byId.values()];
      await this.vault.setStandingIntents(nextIntents);

      if (notifications.length > 0) {
        const existing = normalizeBrainPendingNotifications(
          this.vault.getBrainPendingNotifications(),
        );
        await this.vault.setBrainPendingNotifications(
          [...existing, ...notifications].slice(-100),
        );
      }

      this.lastFireCount = fired.length;
      return { fired, notifications };
    } finally {
      this.ticking = false;
    }
  }
}

export function replaceStandingIntents(
  vault: ConnectorVault,
  raw: unknown[],
): Promise<StandingIntent[]> {
  const intents = raw.filter(isStandingIntent);
  return vault.setStandingIntents(intents).then(() => intents);
}
