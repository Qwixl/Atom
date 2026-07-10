import type { BrainPendingNotification } from "../standingIntents.js";
import type { StoredPushSubscription } from "./types.js";

export interface PushSenderConfig {
  /** VAPID public key (URL-safe base64). */
  vapidPublicKey: string | null;
  /** VAPID private key (URL-safe base64). */
  vapidPrivateKey: string | null;
  /** Contact mailto: or https: for VAPID subject. */
  vapidSubject: string;
  /** Optional FCM server key (legacy HTTP) for Android Capacitor tokens. */
  fcmServerKey: string | null;
}

export function loadPushSenderConfig(env: NodeJS.ProcessEnv = process.env): PushSenderConfig {
  return {
    vapidPublicKey: env.ATOM_VAPID_PUBLIC_KEY?.trim() || null,
    vapidPrivateKey: env.ATOM_VAPID_PRIVATE_KEY?.trim() || null,
    vapidSubject: env.ATOM_VAPID_SUBJECT?.trim() || "mailto:ops@qwixl.com",
    fcmServerKey: env.ATOM_FCM_SERVER_KEY?.trim() || null,
  };
}

export interface PushSendResult {
  sent: number;
  failed: number;
  errors: string[];
}

function notificationPayload(n: BrainPendingNotification): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  return {
    title: n.title || "Atom",
    body: n.body || n.title || "New update from your agent",
    data: {
      notificationId: n.id,
      intentId: n.intentId,
      kind: n.kind,
      url: "/app/",
    },
  };
}

/** Send a brain notification to all stored push subscriptions. Soft-fails per target. */
export async function sendBrainPushNotifications(
  subscriptions: readonly StoredPushSubscription[],
  notification: BrainPendingNotification,
  config: PushSenderConfig = loadPushSenderConfig(),
): Promise<PushSendResult> {
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }
  const payload = notificationPayload(notification);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const sub of subscriptions) {
    try {
      if (sub.kind === "web-push") {
        await sendWebPush(sub, payload, config);
        sent += 1;
      } else if (sub.kind === "fcm") {
        await sendFcm(sub, payload, config);
        sent += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(
        `${sub.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { sent, failed, errors };
}

async function sendWebPush(
  sub: StoredPushSubscription,
  payload: { title: string; body: string; data: Record<string, string> },
  config: PushSenderConfig,
): Promise<void> {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    throw new Error("Web Push not configured (ATOM_VAPID_PUBLIC_KEY / ATOM_VAPID_PRIVATE_KEY)");
  }
  if (!sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Web Push subscription missing keys");
  }
  // Dynamic import so agent-backend starts without web-push when unused.
  const webpush = await import("web-push");
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
    JSON.stringify(payload),
    { TTL: 60 * 60 },
  );
}

async function sendFcm(
  sub: StoredPushSubscription,
  payload: { title: string; body: string; data: Record<string, string> },
  config: PushSenderConfig,
): Promise<void> {
  if (!config.fcmServerKey) {
    throw new Error("FCM not configured (ATOM_FCM_SERVER_KEY)");
  }
  const resp = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${config.fcmServerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: sub.endpoint,
      notification: {
        title: payload.title,
        body: payload.body,
        click_action: "FCM_PLUGIN_ACTIVITY",
      },
      data: payload.data,
      priority: "high",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`FCM HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
}
