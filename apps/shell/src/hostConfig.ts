import type { RegistryTrustPolicy } from "@qwixl/shell-core";
import { PRODUCTION_REGISTRY_INDEX_URL } from "@qwixl/shell-core";
import { isLocalHostUrl, resolveInjectedUrl } from "./productionGuard.js";

/** Production Vite build (atom.qwixl.com and tagged releases). */
export const IS_PRODUCTION_HOST = import.meta.env.PROD;

/** Local Vite dev server — not the same as production deploy. */
export const IS_LOCAL_DEV = import.meta.env.DEV;

/** Browser mode: agent is proxied at /agent-api; no CLI setup in the UI. */
export const ATOM_BROWSER_MODE =
  import.meta.env.VITE_ATOM_BROWSER_MODE === "1" || import.meta.env.VITE_ATOM_BROWSER_MODE === "true";

export const BROWSER_AGENT_API =
  (import.meta.env.VITE_ATOM_AGENT_API as string | undefined)?.trim() || "/agent-api";

const injectedBrowserAgentToken = (import.meta.env.VITE_ATOM_AGENT_TOKEN as string | undefined)?.trim();

export function browserAgentToken(): string | undefined {
  return injectedBrowserAgentToken || undefined;
}

/** Legacy dev plumbing (hosting stack, manual token paste) — not used in browser mode. */
export const SHOW_DEV_WORKFLOWS = IS_LOCAL_DEV && !IS_PRODUCTION_HOST && !ATOM_BROWSER_MODE;

/** atom.qwixl.com — signup via control plane, no local agent required. */
export const MANAGED_HOSTING = IS_PRODUCTION_HOST && !ATOM_BROWSER_MODE;

export const PRODUCTION_REGISTRY_URL = PRODUCTION_REGISTRY_INDEX_URL;

export const PRODUCTION_REGISTRY_TRUST: RegistryTrustPolicy = {
  requireIntegrity: true,
  requireSignature: false,
};

/** Managed hosting control plane — never localhost on production deploys. */
function resolveControlPlaneUrl(): string {
  return resolveInjectedUrl(
    import.meta.env.VITE_CONTROL_PLANE_URL as string | undefined,
    "http://127.0.0.1:5300",
  ) || (IS_PRODUCTION_HOST ? "https://control.atom.qwixl.com" : "http://127.0.0.1:5300");
}

export const CONTROL_PLANE_URL = resolveControlPlaneUrl();

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export { isLocalHostUrl, productionFetchUrl, resolveInjectedUrl, assertProductionAgentUrl } from "./productionGuard.js";

/** Browser-direct LLM keys are not permitted on deployed hosts. */
export const ALLOW_BROWSER_LLM = !IS_PRODUCTION_HOST;
