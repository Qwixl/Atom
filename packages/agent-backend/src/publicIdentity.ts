/**
 * Stable hosted agent public URL (D098).
 * Prefer https://{handle}.agents… over transitional {port}.agents…
 */

export function normalizeAgentHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Build public base URL from template. Supports {handle} and transitional {port}. */
export function resolvePublicBaseUrl(input: {
  template?: string;
  handle?: string;
  port?: number | string;
  fallback?: string;
}): string {
  const template = input.template?.trim();
  if (!template) {
    return (input.fallback ?? "http://127.0.0.1:5204").replace(/\/$/, "");
  }
  const handle = input.handle ? normalizeAgentHandle(input.handle) : "";
  const port = input.port !== undefined ? String(input.port) : "";
  return template
    .replace(/\{handle\}/g, handle || port)
    .replace(/\{port\}/g, port || handle)
    .replace(/\/$/, "");
}

/** True when URL looks like transitional numeric-port subdomain. */
export function isTransitionalPortHostname(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /^\d+\.agents\./i.test(host);
  } catch {
    return false;
  }
}
