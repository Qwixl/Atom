/**
 * Shared model-id identity for behavior, sightings, and admin shortlists.
 * Capabilities may still store the raw configured string; matching uses bare/normalized.
 */

export interface ModelIdentity {
  /** As configured (trimmed). */
  raw: string;
  /** Provider prefix when present (e.g. openai). */
  providerPrefix?: string;
  /** Id without provider prefix / models/ (preserves case of bare segment). */
  bare: string;
  /** Lowercase bare id for matching / dedupe. */
  normalized: string;
}

export function parseModelIdentity(model: string): ModelIdentity {
  const raw = model.trim();
  if (!raw) {
    return { raw: "", bare: "", normalized: "" };
  }
  let rest = raw.replace(/^models\//i, "");
  let providerPrefix: string | undefined;
  const slash = rest.lastIndexOf("/");
  if (slash >= 0) {
    providerPrefix = rest.slice(0, slash).trim() || undefined;
    rest = rest.slice(slash + 1);
  }
  const bare = rest.trim();
  return {
    raw,
    providerPrefix,
    bare,
    normalized: bare.toLowerCase(),
  };
}

/** Prefer provider-prefixed ids for OpenRouter-style eval routes. */
export function preferModelId(a: string, b: string): string {
  if (a.includes("/") && !b.includes("/")) return a;
  if (b.includes("/") && !a.includes("/")) return b;
  return a.length >= b.length ? a : b;
}

/** Merge / queue key: normalized bare id. */
export function modelIdentityKey(model: string): string {
  return parseModelIdentity(model).normalized;
}
