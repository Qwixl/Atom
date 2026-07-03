/** Block loopback and private-network hosts in agent-controlled URLs. */
const PRIVATE_OR_LOOPBACK =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

/**
 * Accept only https URLs with a public host. Returns normalized href or null.
 * Use for agent-controlled image src and other outbound resource references.
 */
export function validateHttpsUrl(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (PRIVATE_OR_LOOPBACK.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Resolve absolute origin for a module bundle URL relative to the shell origin. */
export function resolveModuleBundleOrigin(bundleUrl: string, shellOrigin: string): string {
  const resolved = /^https?:\/\//i.test(bundleUrl)
    ? bundleUrl
    : new URL(bundleUrl, shellOrigin).href;
  return new URL(resolved).origin;
}

/** True when the module bundle is cross-origin from the shell (expected in production). */
export function isCrossOriginModuleBundle(bundleUrl: string, shellOrigin: string): boolean {
  return resolveModuleBundleOrigin(bundleUrl, shellOrigin) !== shellOrigin;
}
