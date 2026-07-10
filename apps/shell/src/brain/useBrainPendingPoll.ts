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
  const raw =
    n.kind === "reminder"
      ? n.body || n.title
      : n.title && n.body && n.body !== n.title
        ? `${n.title}: ${n.body}`
        : n.body || n.title;
  return stripChatProtocolJson(raw);
}

/** Defense in depth: brain watches must never show raw Chat JSON in the feed. */
export function stripChatProtocolJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.includes('{"messages"')) return trimmed;
  const start = trimmed.indexOf("{");
  if (start < 0) return trimmed;
  try {
    const jsonSlice = trimmed.slice(start);
    const parsed = JSON.parse(jsonSlice) as unknown;
    const texts: string[] = [];
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      const obj = value as Record<string, unknown>;
      if (obj.type === "text" && typeof obj.text === "string" && obj.text.trim()) {
        texts.push(obj.text.trim());
      }
      if (Array.isArray(obj.messages)) visit(obj.messages);
      if (obj.composition && typeof obj.composition === "object") {
        const walk = (node: unknown) => {
          if (!node || typeof node !== "object") return;
          const n = node as Record<string, unknown>;
          const props = n.props as Record<string, unknown> | undefined;
          if (props && Array.isArray(props.items)) {
            for (const item of props.items) {
              if (typeof item === "string" && item.trim()) texts.push(item.trim());
            }
          }
          if (typeof props?.title === "string" && props.title.trim()) texts.push(props.title.trim());
          if (Array.isArray(n.children)) for (const c of n.children) walk(c);
          if (n.root) walk(n.root);
        };
        walk(obj.composition);
      }
    };
    visit(parsed);
    if (texts.length === 0) return trimmed;
    const prefix = start > 0 ? trimmed.slice(0, start).trim() : "";
    const body = texts.join("\n\n");
    return prefix ? `${prefix} ${body}` : body;
  } catch {
    return trimmed;
  }
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
      if (!handled) {
        // Defer ack (e.g. calendar/RSS context still loading) so the next poll can compose.
        continue;
      }
      // Thin badge with stable id (dedup + history). Composition is a separate AgentSession turn.
      const badge = n.title?.trim() || "Daily briefing";
      runtime.appendAgentTextWithId(n.id, badge, { origin: "brain", brainKind: n.kind });
      delivered.push(n.id);
      continue;
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
