import type { SecretRef, SecretStore } from "./types.js";

/** Persisted payment-rail connection metadata — secret key lives in SecretStore (D017 phase 4). */
export interface PaymentConnectionConfig {
  /** Rail slug, e.g. `stripe`. */
  provider: "stripe";
  secretRef: SecretRef;
  label?: string;
  /** Stripe Product id from `setup:stripe` (dashboard grouping). */
  productId?: string;
  /** Publishable key for shell Stripe.js (not a secret — safe in connection config). */
  publishableKey?: string;
}

export const DEFAULT_STRIPE_PAYMENT_REF = "atom.payment.stripe.secret";
export const PAYMENT_CONNECTIONS_STORAGE_KEY = "atom-payment-connections";

export function resolvePaymentSecret(
  connection: PaymentConnectionConfig,
  secretStore: SecretStore,
): string | null {
  const secret = secretStore.get(connection.secretRef);
  return secret?.trim() ? secret.trim() : null;
}

export function isPaymentConnectionReady(
  connection: PaymentConnectionConfig,
  secretStore: SecretStore,
): boolean {
  return resolvePaymentSecret(connection, secretStore) !== null;
}

export function loadPaymentConnections(
  storageKey = PAYMENT_CONNECTIONS_STORAGE_KEY,
): PaymentConnectionConfig[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPaymentConnectionShape);
  } catch {
    return [];
  }
}

export function persistPaymentConnections(
  connections: PaymentConnectionConfig[],
  storageKey = PAYMENT_CONNECTIONS_STORAGE_KEY,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(connections));
  } catch {
    // Best-effort persistence.
  }
}

export function upsertPaymentConnection(
  connection: PaymentConnectionConfig,
): PaymentConnectionConfig[] {
  const connections = loadPaymentConnections().filter(
    (c) => c.provider !== connection.provider || c.secretRef !== connection.secretRef,
  );
  connections.push(connection);
  persistPaymentConnections(connections);
  return connections;
}

function isPaymentConnectionShape(value: unknown): value is PaymentConnectionConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as PaymentConnectionConfig;
  return c.provider === "stripe" && typeof c.secretRef === "string";
}
