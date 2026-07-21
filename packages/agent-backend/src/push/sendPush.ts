import type { BrainPendingNotification } from "../standingIntents.js";
import { loadFcmServiceAccount, sendFcmHttpV1, type FcmServiceAccount } from "./fcmHttpV1.js";
import type { StoredPushSubscription } from "./types.js";

export interface PushSenderConfig {
  /** VAPID public key (URL-safe base64). */
  vapidPublicKey: string | null;
  /** VAPID private key (URL-safe base64). */
  vapidPrivateKey: string | null;
  /** Contact mailto: or https: for VAPID subject. */
  vapidSubject: string;
  /**
   * Firebase service account for FCM HTTP v1 (Android Capacitor tokens).
   * Prefer this over the discontinued legacy server key.
   */
  fcmServiceAccount: FcmServiceAccount | null;
  /** @deprecated Legacy FCM server key — retired by Google; kept only for migration detection. */
  fcmServerKey: string | null;
}

export function loadPushSenderConfig(env: NodeJS.ProcessEnv = process.env): PushSenderConfig {
  return {
    vapidPublicKey: env.ATOM_VAPID_PUBLIC_KEY?.trim() || null,
    vapidPrivateKey: env.ATOM_VAPID_PRIVATE_KEY?.trim() || null,
    vapidSubject: env.ATOM_VAPID_SUBJECT?.trim() || "mailto:ops@qwixl.com",
    fcmServiceAccount: loadFcmServiceAccount(env),
    fcmServerKey: env.ATOM_FCM_SERVER_KEY?.trim() || null,
  };
}

export function isFcmConfigured(config: PushSenderConfig = loadPushSenderConfig()): boolean {
  return Boolean(config.fcmServiceAccount);
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
  if (!config.fcmServiceAccount) {
    if (config.fcmServerKey) {
      throw new Error(
        "FCM legacy server key is no longer supported — set ATOM_FCM_SERVICE_ACCOUNT_JSON/PATH/B64 (HTTP v1)",
      );
    }
    throw new Error(
      "FCM not configured (ATOM_FCM_SERVICE_ACCOUNT_JSON / ATOM_FCM_SERVICE_ACCOUNT_PATH / ATOM_FCM_SERVICE_ACCOUNT_B64)",
    );
  }
  await sendFcmHttpV1(config.fcmServiceAccount, sub.endpoint, payload);
}
