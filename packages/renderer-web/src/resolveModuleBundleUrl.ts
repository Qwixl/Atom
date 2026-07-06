/** Resolve a catalog bundle path against the shell base (e.g. /app/ in production). */
export function resolveModuleBundleUrl(bundleUrl: string): string {
  if (/^https?:\/\//i.test(bundleUrl)) return bundleUrl;
  const pathPrefix =
    typeof window !== "undefined" && window.location.pathname.startsWith("/app")
      ? "/app/"
      : "/";
  return new URL(bundleUrl.replace(/^\//, ""), `${window.location.origin}${pathPrefix}`).href;
}
