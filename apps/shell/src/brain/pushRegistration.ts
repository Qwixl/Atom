import type { CommsAgentConfig } from "../comms/types.js";
import {
  deletePushSubscription,
  loadPushSubscriptionStatus,
  putPushSubscription,
  type PushSubscriptionStatus,
} from "../custody/client.js";

const PUSH_OPT_IN_KEY = "atom.brain.pushOptIn";

export function loadPushOptIn(): boolean {
  try {
    return localStorage.getItem(PUSH_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePushOptIn(enabled: boolean): void {
  localStorage.setItem(PUSH_OPT_IN_KEY, enabled ? "1" : "0");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function fetchPushStatus(config: CommsAgentConfig): Promise<PushSubscriptionStatus> {
  return loadPushSubscriptionStatus(config);
}

export async function saveWebPushSubscription(
  config: CommsAgentConfig,
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON();
  await putPushSubscription(config, {
    kind: "web-push",
    endpoint: json.endpoint!,
    keys: json.keys as { p256dh: string; auth: string },
    userAgent: navigator.userAgent,
  });
}

export async function saveFcmToken(config: CommsAgentConfig, token: string): Promise<void> {
  await putPushSubscription(config, {
    kind: "fcm",
    endpoint: token,
    userAgent: navigator.userAgent,
  });
}

/** Register Web Push after vault unlock when owner opted in. */
export async function ensureWebPushSubscription(
  config: CommsAgentConfig,
): Promise<"subscribed" | "unsupported" | "denied" | "not-configured" | "error"> {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  let status: PushSubscriptionStatus;
  try {
    status = await fetchPushStatus(config);
  } catch {
    return "error";
  }
  if (!status.webPushConfigured || !status.vapidPublicKey) return "not-configured";

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await registerServiceWorker();
  if (!reg) return "error";

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyBytes = urlBase64ToUint8Array(status.vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength,
        ) as ArrayBuffer,
      });
    }
    await saveWebPushSubscription(config, sub);
    return "subscribed";
  } catch {
    return "error";
  }
}

export async function unsubscribeWebPush(config: CommsAgentConfig): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await deletePushSubscription(config, endpoint).catch(() => undefined);
  }
}

/** Capacitor Android FCM registration when running inside the native wrapper. */
export async function ensureCapacitorPush(
  config: CommsAgentConfig,
): Promise<"subscribed" | "unsupported" | "denied" | "error"> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return "denied";
    await PushNotifications.register();
    // Open Chat (or payload url) when the owner taps a notification.
    void PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const data = event.notification.data as { url?: string } | undefined;
      const target = typeof data?.url === "string" && data.url.trim() ? data.url.trim() : "/app/";
      try {
        const next = new URL(target, window.location.origin);
        if (next.origin === window.location.origin) {
          window.location.assign(`${next.pathname}${next.search}${next.hash}`);
        }
      } catch {
        window.location.assign("/app/");
      }
    });
    return await new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve("error"), 15_000);
      void PushNotifications.addListener("registration", (token) => {
        window.clearTimeout(timeout);
        void saveFcmToken(config, token.value)
          .then(() => resolve("subscribed"))
          .catch(() => resolve("error"));
      });
      void PushNotifications.addListener("registrationError", () => {
        window.clearTimeout(timeout);
        resolve("error");
      });
    });
  } catch {
    return "unsupported";
  }
}
