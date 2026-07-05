const IS_PRODUCTION = import.meta.env.PROD;

/** True for http://127.0.0.1:* and http://localhost:* */
export function isLocalHostUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url.trim());
}

/**
 * Resolve a Vite-injected URL. On production deploys, never return a localhost default
 * baked in at build time — only explicit non-local overrides pass through.
 */
export function resolveInjectedUrl(envValue: string | undefined, devFallback: string): string {
  const trimmed = envValue?.trim().replace(/\/$/, "");
  if (IS_PRODUCTION) {
    if (trimmed && !isLocalHostUrl(trimmed)) return trimmed;
    return "";
  }
  return trimmed || devFallback.replace(/\/$/, "");
}

/** Return URL for fetch(), or null if this deploy must not contact that host. */
export function productionFetchUrl(url: string | undefined | null): string | null {
  const trimmed = url?.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (IS_PRODUCTION && isLocalHostUrl(trimmed)) return null;
  return trimmed;
}

/** Block localhost agent API calls from the hosted web shell. */
export function assertProductionAgentUrl(adminUrl: string): void {
  if (IS_PRODUCTION && isLocalHostUrl(adminUrl)) {
    throw new Error("This site cannot connect to an agent on your computer. Create an account to get a hosted agent.");
  }
}

/** Validate AG-UI backend URL on production deploys (M21.6). */
export function validateProductionAgUiUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Enter a chat agent URL.";
  if (IS_PRODUCTION && isLocalHostUrl(trimmed)) {
    return "This site cannot use a chat agent on your computer.";
  }
  if (IS_PRODUCTION && !trimmed.startsWith("https://")) {
    return "Use an HTTPS URL for your chat agent.";
  }
  return null;
}
