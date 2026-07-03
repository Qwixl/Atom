import type { RegistryTrustPolicy } from "@qwixl/shell-core";

/** Production Vite build (shell-atom.vercel.app and tagged releases). */
export const IS_PRODUCTION_HOST = import.meta.env.PROD;

export const PRODUCTION_REGISTRY_URL = "https://atom-registry.vercel.app/registry/index.json";

export const PRODUCTION_REGISTRY_TRUST: RegistryTrustPolicy = {
  requireIntegrity: true,
  requireSignature: false,
};

/** Browser-direct LLM keys are not permitted on deployed hosts. */
export const ALLOW_BROWSER_LLM = !IS_PRODUCTION_HOST;
