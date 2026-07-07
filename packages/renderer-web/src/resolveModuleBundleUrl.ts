/** Resolve a catalog bundle path against the shell Vite base ("/" dev, "/app/" prod). */
export function resolveModuleBundleUrlWithBase(
  bundleUrl: string,
  origin: string,
  baseUrl: string,
): string {
  if (/^https?:\/\//i.test(bundleUrl)) return bundleUrl;
  const pathPrefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(bundleUrl.replace(/^\//, ""), `${origin}${pathPrefix}`).href;
}

function shellBaseUrl(): string {
  // When bundled by Vite: BASE_URL is "/" in dev, "/app/" in production.
  // Do not infer from window.location.pathname — dev serves the shell at
  // /app/ via rewrite but static modules still live at /modules/.
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  if (typeof env?.BASE_URL === "string" && env.BASE_URL.length > 0) {
    return env.BASE_URL;
  }
  return "/";
}

/** Resolve a catalog bundle path against the shell base (e.g. /app/ in production). */
export function resolveModuleBundleUrl(bundleUrl: string): string {
  if (/^https?:\/\//i.test(bundleUrl)) return bundleUrl;
  if (typeof window === "undefined") return bundleUrl;
  return resolveModuleBundleUrlWithBase(bundleUrl, window.location.origin, shellBaseUrl());
}
