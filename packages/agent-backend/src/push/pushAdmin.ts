import type { Express } from "express";
import type { ConnectorVault } from "../connectorVault.js";
import { loadPushSenderConfig } from "./sendPush.js";
import {
  createPushSubscriptionId,
  isStoredPushSubscription,
  normalizePushSubscriptions,
  type StoredPushSubscription,
} from "./types.js";

export interface PushAdminDeps {
  vault: ConnectorVault;
}

function coerceSubscription(raw: unknown): StoredPushSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === "web-push" || r.kind === "fcm" ? r.kind : null;
  const endpoint = typeof r.endpoint === "string" ? r.endpoint.trim() : "";
  if (!kind || !endpoint) return null;
  const now = new Date().toISOString();
  const id =
    typeof r.id === "string" && r.id.trim()
      ? r.id.trim()
      : createPushSubscriptionId(kind);
  const sub: StoredPushSubscription = {
    id,
    kind,
    endpoint,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
    updatedAt: now,
  };
  if (kind === "web-push") {
    const keys = r.keys as Record<string, unknown> | undefined;
    if (
      !keys ||
      typeof keys.p256dh !== "string" ||
      typeof keys.auth !== "string" ||
      !keys.p256dh.trim() ||
      !keys.auth.trim()
    ) {
      return null;
    }
    sub.keys = { p256dh: keys.p256dh.trim(), auth: keys.auth.trim() };
  }
  if (typeof r.userAgent === "string" && r.userAgent.trim()) {
    sub.userAgent = r.userAgent.trim().slice(0, 256);
  }
  return isStoredPushSubscription(sub) ? sub : null;
}

export function registerPushAdminRoutes(app: Express, deps: PushAdminDeps): void {
  app.get("/brain/push-subscription", (_req, res) => {
    const config = loadPushSenderConfig();
    res.json({
      ok: true,
      subscriptions: normalizePushSubscriptions(deps.vault.getPushSubscriptions()),
      vapidPublicKey: config.vapidPublicKey,
      webPushConfigured: Boolean(config.vapidPublicKey && config.vapidPrivateKey),
      fcmConfigured: Boolean(config.fcmServerKey),
    });
  });

  app.put("/brain/push-subscription", async (req, res) => {
    const body = req.body as { subscription?: unknown; subscriptions?: unknown };
    if (Array.isArray(body.subscriptions)) {
      const coerced: StoredPushSubscription[] = [];
      for (const item of body.subscriptions) {
        const s = coerceSubscription(item);
        if (!s) {
          res.status(400).json({ error: "invalid subscriptions array" });
          return;
        }
        coerced.push(s);
      }
      await deps.vault.setPushSubscriptions(coerced);
      res.json({ ok: true, subscriptions: coerced });
      return;
    }
    const single = coerceSubscription(body.subscription);
    if (!single) {
      res.status(400).json({ error: "subscription object required" });
      return;
    }
    const existing = normalizePushSubscriptions(deps.vault.getPushSubscriptions());
    const withoutDup = existing.filter(
      (s) => s.endpoint !== single.endpoint && s.id !== single.id,
    );
    const next = [...withoutDup, single].slice(-10);
    await deps.vault.setPushSubscriptions(next);
    res.json({ ok: true, subscriptions: next });
  });

  app.delete("/brain/push-subscription", async (req, res) => {
    const body = req.body as { id?: string; endpoint?: string };
    const id = body.id?.trim();
    const endpoint = body.endpoint?.trim();
    if (!id && !endpoint) {
      res.status(400).json({ error: "id or endpoint required" });
      return;
    }
    const existing = normalizePushSubscriptions(deps.vault.getPushSubscriptions());
    const next = existing.filter((s) => {
      if (id && s.id === id) return false;
      if (endpoint && s.endpoint === endpoint) return false;
      return true;
    });
    await deps.vault.setPushSubscriptions(next);
    res.json({ ok: true, subscriptions: next });
  });
}
