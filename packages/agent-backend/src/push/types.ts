/** Push subscription records stored in the connector vault (Web Push + FCM). */

export type PushSubscriptionKind = "web-push" | "fcm";

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  id: string;
  kind: PushSubscriptionKind;
  /** Web Push endpoint URL, or FCM registration token. */
  endpoint: string;
  keys?: WebPushSubscriptionKeys;
  /** User-Agent / platform hint for debugging. */
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export function isStoredPushSubscription(value: unknown): value is StoredPushSubscription {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (r.kind !== "web-push" && r.kind !== "fcm") return false;
  if (typeof r.id !== "string" || !r.id.trim()) return false;
  if (typeof r.endpoint !== "string" || !r.endpoint.trim()) return false;
  if (typeof r.createdAt !== "string" || typeof r.updatedAt !== "string") return false;
  if (r.kind === "web-push") {
    if (!r.keys || typeof r.keys !== "object") return false;
    const k = r.keys as Record<string, unknown>;
    if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  }
  return true;
}

export function normalizePushSubscriptions(raw: unknown): StoredPushSubscription[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredPushSubscription);
}

export function createPushSubscriptionId(kind: PushSubscriptionKind): string {
  return `push_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
