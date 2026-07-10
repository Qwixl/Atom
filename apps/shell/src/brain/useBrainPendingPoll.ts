import { useEffect, useRef } from "react";
import type { ConversationRuntime } from "@qwixl/shell-core";
import { loadCommsAgentConfigSecure } from "../comms/storage.js";
import {
  loadBrainPending,
  markBrainNotificationsDelivered,
  type BrainPendingNotification,
} from "../custody/client.js";

export const BRAIN_PENDING_POLL_MS = 15_000;

export function formatBrainNotificationText(n: BrainPendingNotification): string {
  if (n.kind === "reminder") return n.body || n.title;
  if (n.title && n.body && n.body !== n.title) return `${n.title}: ${n.body}`;
  return n.body || n.title;
}

export type BrainPendingDeliveryHooks = {
  /**
   * When a daily-briefing fires, request a composition turn via AgentSession
   * instead of (or in addition to) plain text. Return true if the fire was
   * handled (caller should still ack delivery).
   */
  onDailyBriefingFire?: (n: BrainPendingNotification) => boolean;
};

/** Deliver undelivered brain notifications into the chat feed; return delivered ids. */
export async function deliverBrainPendingToFeed(
  runtime: ConversationRuntime,
  notifications: readonly BrainPendingNotification[],
  hooks?: BrainPendingDeliveryHooks,
): Promise<string[]> {
  const delivered: string[] = [];
  for (const n of notifications) {
    if (n.deliveredAt) continue;

    if (n.kind === "daily-briefing" && hooks?.onDailyBriefingFire) {
      const handled = hooks.onDailyBriefingFire(n);
      if (handled) {
        delivered.push(n.id);
        continue;
      }
    }

    const text = formatBrainNotificationText(n);
    const appended = runtime.appendAgentTextWithId(n.id, text, {
      origin: "brain",
      brainKind: n.kind,
    });
    if (appended) delivered.push(n.id);
    else {
      // Already on feed (e.g. after custody restore) — still ack the server.
      delivered.push(n.id);
    }
  }
  return delivered;
}

/**
 * Poll GET /brain/pending while the vault is unlocked and inject undelivered
 * notifications into Chat (BK-43). Web push is a parallel closed-app path.
 */
export function useBrainPendingPoll(options: {
  enabled: boolean;
  conversation: ConversationRuntime | null;
  intervalMs?: number;
  onDailyBriefingFire?: (n: BrainPendingNotification) => boolean;
}): void {
  const { enabled, conversation, intervalMs = BRAIN_PENDING_POLL_MS, onDailyBriefingFire } =
    options;
  const inFlight = useRef(false);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const onDailyBriefingFireRef = useRef(onDailyBriefingFire);
  onDailyBriefingFireRef.current = onDailyBriefingFire;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      if (cancelled || inFlight.current) return;
      const runtime = conversationRef.current;
      if (!runtime) return;
      inFlight.current = true;
      try {
        const config = await loadCommsAgentConfigSecure();
        if (!config.adminToken?.trim()) return;
        const pending = await loadBrainPending(config, true);
        if (cancelled || pending.length === 0) return;
        const ids = await deliverBrainPendingToFeed(runtime, pending, {
          onDailyBriefingFire: onDailyBriefingFireRef.current,
        });
        if (ids.length > 0 && !cancelled) {
          await markBrainNotificationsDelivered(config, ids);
        }
      } catch {
        // Soft-fail: agent may be offline or routes not yet deployed.
      } finally {
        inFlight.current = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}
