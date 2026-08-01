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
import {
  refreshDueSurfaces,
  type BoardBindingExecutor,
  type BoardDegradeRequest,
  type SurfaceRefreshDueContext,
} from "./boardRefresh.js";
import { loadPresentationBoardState, savePresentationBoardState } from "./boardState.js";

/** Multi-tab storm floor for noteSessionOpen (challenger PS-05a). */
const SESSION_OPEN_DEBOUNCE_MS = 30_000;

export interface BrainSchedulerOptions {
  vault: ConnectorVault;
  /** Tick interval in ms (default 60s). */
  intervalMs?: number;
  /**
   * When false, scheduler still runs but only evaluates intents if at least one
   * is enabled — used for free-tier duty-cycle later (BK-45). Default true.
   * May be a function for D096 hourly wake windows.
   */
  alwaysOn?: boolean | (() => boolean);
  /** D096 — expire asleep inbox + log pending count each tick. */
  onReachabilityWake?: () => void;
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
  /**
   * Injected connector executor for board binding refresh (PS-05).
   * Production passes `createReadOnlyConnectorExecutor(vault)`.
   */
  boardExecutor?: BoardBindingExecutor;
  /** Connector ids entitled at refresh time; defaults to listing configured connectors. */
  listEntitledConnectors?: (vault: ConnectorVault) => Promise<readonly string[]>;
}

export interface BrainTickResult {
  fired: StandingIntent[];
  notifications: BrainPendingNotification[];
  boardRefreshedSurfaceIds: string[];
  boardExpiredSurfaceIds: string[];
  boardDegradeRequests: BoardDegradeRequest[];
}

export class BrainScheduler {
  private readonly vault: ConnectorVault;
  private readonly intervalMs: number;
  private readonly alwaysOn: boolean;
  private readonly resolveAlwaysOn?: () => boolean;
  private readonly onReachabilityWake?: () => void;
  private readonly killSwitch: boolean;
  private readonly now: () => Date;
  private readonly onFire?: (intent: StandingIntent, notification: BrainPendingNotification) => void;
  private readonly resolveNotification?: (
    intent: StandingIntent,
    firedAt: Date,
  ) => Promise<BrainPendingNotification | null>;
  private readonly boardExecutor?: BoardBindingExecutor;
  private readonly listEntitledConnectors?: (
    vault: ConnectorVault,
  ) => Promise<readonly string[]>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastTickAt: string | null = null;
  private lastFireCount = 0;
  /** Pending board on-open marker; cleared only after an active refreshBoard. */
  private sessionOpenedAtMs: number | null = null;
  private lastSessionOpenNotedAtMs = 0;
  /** Pending connector-change ids; drained per active refreshBoard. */
  private changedConnectors = new Set<string>();

  constructor(options: BrainSchedulerOptions) {
    this.vault = options.vault;
    this.intervalMs = Math.max(5_000, options.intervalMs ?? 60_000);
    this.alwaysOn = typeof options.alwaysOn === "function" ? true : options.alwaysOn !== false;
    this.resolveAlwaysOn = typeof options.alwaysOn === "function" ? options.alwaysOn : undefined;
    this.onReachabilityWake = options.onReachabilityWake;
    this.killSwitch = options.killSwitch === true;
    this.now = options.now ?? (() => new Date());
    this.onFire = options.onFire;
    this.resolveNotification = options.resolveNotification;
    this.boardExecutor = options.boardExecutor;
    this.listEntitledConnectors = options.listEntitledConnectors;
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
      alwaysOn: this.isBrainActive(),
      killSwitch: this.killSwitch,
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt,
      lastFireCount: this.lastFireCount,
      intentCount: normalizeStandingIntents(this.vault.getStandingIntents()).length,
      pendingCount: this.vault.getBrainPendingNotifications().length,
    };
  }

  /**
   * Shell session-open signal for board `on-open` triggers (PS-05a).
   * Debounced so multi-tab POSTs do not re-stamp forever. Returns whether the
   * marker was accepted.
   */
  noteSessionOpen(atMs?: number): boolean {
    const at = atMs ?? this.now().getTime();
    if (
      this.lastSessionOpenNotedAtMs > 0 &&
      at - this.lastSessionOpenNotedAtMs < SESSION_OPEN_DEBOUNCE_MS
    ) {
      return false;
    }
    this.lastSessionOpenNotedAtMs = at;
    this.sessionOpenedAtMs = at;
    return true;
  }

  /** Credential/config change signal for board `connector-change` triggers. */
  noteConnectorChange(connectorId: string): void {
    const id = connectorId.trim();
    if (!id) return;
    this.changedConnectors.add(id);
  }

  /** Test/diagnostic: pending board due markers. */
  getPendingBoardDueContext(): {
    sessionOpenedAtMs: number | null;
    changedConnectors: string[];
  } {
    return {
      sessionOpenedAtMs: this.sessionOpenedAtMs,
      changedConnectors: [...this.changedConnectors].sort(),
    };
  }

  /** Evaluate due intents and board refresh once. Safe to call from tests without start(). */
  async tick(): Promise<BrainTickResult> {
    const empty: BrainTickResult = {
      fired: [],
      notifications: [],
      boardRefreshedSurfaceIds: [],
      boardExpiredSurfaceIds: [],
      boardDegradeRequests: [],
    };
    if (this.ticking) return empty;
    this.ticking = true;
    try {
      const now = this.now();
      this.lastTickAt = now.toISOString();
      this.onReachabilityWake?.();
      if (this.killSwitch || !this.isBrainActive()) {
        this.lastFireCount = 0;
        return empty;
      }

      const boardResult = await this.refreshBoard(now);

      const intents = normalizeStandingIntents(this.vault.getStandingIntents());
      const due = listDueIntents(intents, now);

      const fired: StandingIntent[] = [];
      const notifications: BrainPendingNotification[] = [...boardResult.notifications];
      const byId = new Map(intents.map((intent) => [intent.id, intent]));

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
      if (due.length > 0) {
        await this.vault.setStandingIntents(nextIntents);
      }

      if (notifications.length > 0) {
        const existing = normalizeBrainPendingNotifications(
          this.vault.getBrainPendingNotifications(),
        );
        await this.vault.setBrainPendingNotifications(
          [...existing, ...notifications].slice(-100),
        );
      }

      this.lastFireCount = fired.length;
      return {
        fired,
        notifications,
        boardRefreshedSurfaceIds: boardResult.refreshedSurfaceIds,
        boardExpiredSurfaceIds: boardResult.expiredSurfaceIds,
        boardDegradeRequests: boardResult.degradeRequests,
      };
    } finally {
      this.ticking = false;
    }
  }

  private async refreshBoard(now: Date): Promise<{
    refreshedSurfaceIds: string[];
    expiredSurfaceIds: string[];
    degradeRequests: BoardDegradeRequest[];
    notifications: BrainPendingNotification[];
  }> {
    if (!this.boardExecutor) {
      return {
        refreshedSurfaceIds: [],
        expiredSurfaceIds: [],
        degradeRequests: [],
        notifications: [],
      };
    }

    const { v2, v1Regions } = loadPresentationBoardState(this.vault);
    if (v2.surfaces.length === 0) {
      // Nothing to refresh; drop pending markers so they cannot accumulate forever.
      this.sessionOpenedAtMs = null;
      this.changedConnectors.clear();
      return {
        refreshedSurfaceIds: [],
        expiredSurfaceIds: [],
        degradeRequests: [],
        notifications: [],
      };
    }

    const entitled =
      (await this.listEntitledConnectors?.(this.vault)) ??
      (await defaultListEntitledConnectors(this.vault));

    const sessionSnapshot = this.sessionOpenedAtMs;
    const changedBatch = new Set(this.changedConnectors);
    this.changedConnectors.clear();

    const dueContext: SurfaceRefreshDueContext = {
      sessionOpened: sessionSnapshot !== null,
      sessionOpenedAtMs: sessionSnapshot ?? undefined,
      changedConnectors: changedBatch.size > 0 ? changedBatch : undefined,
    };

    let result;
    try {
      result = await refreshDueSurfaces({
        surfaces: v2.surfaces,
        executor: this.boardExecutor,
        entitledConnectors: entitled,
        now: now.getTime(),
        dueContext,
      });
    } catch (error) {
      for (const id of changedBatch) this.changedConnectors.add(id);
      throw error;
    }

    // Clear session marker only if no newer noteSessionOpen arrived mid-tick.
    if (this.sessionOpenedAtMs === sessionSnapshot) {
      this.sessionOpenedAtMs = null;
    }

    if (result.stateChanged) {
      await savePresentationBoardState(
        this.vault,
        {
          ...v2,
          surfaces: result.surfaces,
          dismissed: v2.dismissed,
          updatedAt: now.getTime(),
        },
        v1Regions,
      );
    }

    const notifications = result.degradeRequests.map((request) =>
      buildBoardDegradeNotification(request, now),
    );
    return {
      refreshedSurfaceIds: result.refreshedSurfaceIds,
      expiredSurfaceIds: result.expiredSurfaceIds,
      degradeRequests: result.degradeRequests,
      notifications,
    };
  }

  private isBrainActive(): boolean {
    if (this.resolveAlwaysOn) return this.resolveAlwaysOn();
    return this.alwaysOn;
  }
}

async function defaultListEntitledConnectors(vault: ConnectorVault): Promise<readonly string[]> {
  const { listConfiguredConnectorIds } = await import("./connectorRegistry.js");
  return listConfiguredConnectorIds(vault);
}

function buildBoardDegradeNotification(
  request: BoardDegradeRequest,
  firedAt: Date,
): BrainPendingNotification {
  return {
    id: `board_degrade_${firedAt.getTime().toString(36)}_${request.surfaceId}`,
    intentId: `board:${request.surfaceId}`,
    kind: "watch",
    title: "Board tile degraded",
    body: request.message,
    createdAt: firedAt.toISOString(),
    deliveredAt: null,
  };
}

export function replaceStandingIntents(
  vault: ConnectorVault,
  raw: unknown[],
): Promise<StandingIntent[]> {
  const intents = raw.filter(isStandingIntent);
  return vault.setStandingIntents(intents).then(() => intents);
}
