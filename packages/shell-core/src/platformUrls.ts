/** Canonical production hosts (custom domains on Vercel). */
export const PRODUCTION_SHELL_ORIGIN = "https://atom.qwixl.com";
export const STAGING_SHELL_ORIGIN = "https://stg.atom.qwixl.com";
/** Some clients redirect via HTTP before HSTS; allow both for CORS preflight. */
export const STAGING_SHELL_ORIGIN_HTTP = "http://stg.atom.qwixl.com";
export const PRODUCTION_REGISTRY_ORIGIN = "https://atom.registry.qwixl.com";
export const PRODUCTION_REGISTRY_INDEX_URL = `${PRODUCTION_REGISTRY_ORIGIN}/registry/index.json`;

export const LOCAL_SHELL_ORIGINS = [
  "http://localhost:5200",
  "http://127.0.0.1:5200",
  "http://localhost:5203",
  "http://127.0.0.1:5203",
] as const;

export const DEPLOYED_SHELL_ORIGINS = [
  PRODUCTION_SHELL_ORIGIN,
  STAGING_SHELL_ORIGIN,
  STAGING_SHELL_ORIGIN_HTTP,
] as const;

export function defaultShellOriginsCsv(): string {
  return [...LOCAL_SHELL_ORIGINS, ...DEPLOYED_SHELL_ORIGINS].join(",");
}
