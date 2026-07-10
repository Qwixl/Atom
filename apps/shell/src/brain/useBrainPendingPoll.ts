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

/** Deliver undelivered brain notifications into the chat feed; return delivered ids. */
export async function deliverBrainPendingToFeed(
  runtime: ConversationRuntime,
  notifications: readonly BrainPendingNotification[],
): Promise<string[]> {
  const delivered: string[] = [];
  for (const n of notifications) {
    if (n.deliveredAt) continue;
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
 * notifications into Chat (BK-43). Web push deferred.
 */
export function useBrainPendingPoll(options: {
  enabled: boolean;
  conversation: ConversationRuntime | null;
  intervalMs?: number;
}): void {
  const { enabled, conversation, intervalMs = BRAIN_PENDING_POLL_MS } = options;
  const inFlight = useRef(false);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

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
        const ids = await deliverBrainPendingToFeed(runtime, pending);
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
