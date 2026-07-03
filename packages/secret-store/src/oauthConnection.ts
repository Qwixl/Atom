import type { SecretRef, SecretStore } from "./types.js";

/** Persisted OAuth connection metadata — tokens live in SecretStore (D017). */
export interface OAuthConnectionConfig {
  /** Provider slug, e.g. `google`, `microsoft`. */
  provider: string;
  /** OAuth scopes granted (e.g. calendar read/write). */
  scopes: string[];
  secretRef: SecretRef;
  /** Human label for Settings UI. */
  label?: string;
}

export const DEFAULT_GOOGLE_CALENDAR_OAUTH_REF = "atom.oauth.google.calendar";
export const OAUTH_CONNECTIONS_STORAGE_KEY = "atom-oauth-connections";

export function resolveOAuthToken(
  connection: OAuthConnectionConfig,
  secretStore: SecretStore,
): string | null {
  const token = secretStore.get(connection.secretRef);
  return token?.trim() ? token.trim() : null;
}

export function isOAuthConnectionReady(
  connection: OAuthConnectionConfig,
  secretStore: SecretStore,
): boolean {
  return resolveOAuthToken(connection, secretStore) !== null;
}

export function loadOAuthConnections(
  storageKey = OAUTH_CONNECTIONS_STORAGE_KEY,
): OAuthConnectionConfig[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOAuthConnectionShape);
  } catch {
    return [];
  }
}

export function persistOAuthConnections(
  connections: OAuthConnectionConfig[],
  storageKey = OAUTH_CONNECTIONS_STORAGE_KEY,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(connections));
  } catch {
    // Best-effort persistence.
  }
}

export function upsertOAuthConnection(connection: OAuthConnectionConfig): OAuthConnectionConfig[] {
  const connections = loadOAuthConnections().filter((c) => c.secretRef !== connection.secretRef);
  connections.push(connection);
  persistOAuthConnections(connections);
  return connections;
}

function isOAuthConnectionShape(value: unknown): value is OAuthConnectionConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as OAuthConnectionConfig;
  return (
    typeof c.provider === "string" &&
    Array.isArray(c.scopes) &&
    c.scopes.every((s) => typeof s === "string") &&
    typeof c.secretRef === "string"
  );
}
