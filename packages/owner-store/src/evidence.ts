import type { PreferenceTier } from "./tier.js";

/** Append-only observation on an owner record. See docs/02-architecture/08-preference-evidence.md. */
export type EvidenceKind =
  | "stated"
  | "confirmed"
  | "acted-on"
  | "overridden"
  | "contradicted"
  | "dismissed";

export interface PreferenceEvidence {
  kind: EvidenceKind;
  at: number;
  note?: string;
  /** Phase 3: transcript-visible context (e.g. traveling-with-family). */
  contextTags?: string[];
}

export interface DerivedPreferenceWeights {
  confidence: number;
  strength: number;
}

const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
const TASTE_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

function halfLifeMsForTier(tier: PreferenceTier): number {
  switch (tier) {
    case "constraint":
      return Infinity;
    case "taste":
      return TASTE_HALF_LIFE_MS;
    default:
      return HALF_LIFE_MS;
  }
}

function decay(at: number, tier: PreferenceTier, now = Date.now()): number {
  const halfLife = halfLifeMsForTier(tier);
  if (!Number.isFinite(halfLife)) return 1;
  const age = Math.max(0, now - at);
  return Math.pow(0.5, age / halfLife);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const EMPTY_DEFAULTS: Record<PreferenceTier, DerivedPreferenceWeights> = {
  constraint: { confidence: 0.7, strength: 0.85 },
  preference: { confidence: 0.35, strength: 0.5 },
  taste: { confidence: 0.25, strength: 0.35 },
};

/** Derive confidence and strength from evidence + recency + tier. Weights are never stored. */
export function derivePreferenceWeights(
  evidence: readonly PreferenceEvidence[],
  tier: PreferenceTier = "preference",
  now = Date.now(),
): DerivedPreferenceWeights {
  if (evidence.length === 0) {
    return EMPTY_DEFAULTS[tier];
  }

  let confidence = 0;
  let strength = tier === "constraint" ? 0.75 : tier === "taste" ? 0.35 : 0.5;

  for (const event of evidence) {
    const w = decay(event.at, tier, now);
    switch (event.kind) {
      case "stated":
        confidence += (tier === "constraint" ? 0.55 : tier === "taste" ? 0.25 : 0.35) * w;
        strength += (tier === "constraint" ? 0.45 : tier === "taste" ? 0.05 : 0.08) * w;
        break;
      case "confirmed":
        confidence += (tier === "constraint" ? 0.2 : 0.15) * w;
        strength += (tier === "constraint" ? 0.12 : tier === "taste" ? 0.06 : 0.1) * w;
        break;
      case "acted-on":
        confidence += (tier === "taste" ? 0.12 : 0.2) * w;
        strength += (tier === "taste" ? 0.08 : tier === "constraint" ? 0.08 : 0.14) * w;
        break;
      case "overridden":
        confidence -= (tier === "constraint" ? 0.02 : 0.05) * w;
        strength -= (tier === "constraint" ? 0.05 : tier === "taste" ? 0.35 : 0.22) * w;
        break;
      case "contradicted":
        confidence -= (tier === "constraint" ? 0.35 : 0.28) * w;
        strength -= (tier === "constraint" ? 0.4 : 0.3) * w;
        break;
      case "dismissed":
        confidence -= (tier === "constraint" ? 0.08 : 0.12) * w;
        break;
    }
  }

  const result = {
    confidence: clamp(confidence, 0, 1),
    strength: clamp(strength, 0, 1),
  };

  if (tier === "constraint" && evidence.some((e) => e.kind === "stated" || e.kind === "confirmed")) {
    result.confidence = Math.max(result.confidence, 0.7);
    result.strength = Math.max(result.strength, 0.85);
  }

  return result;
}

/** Curator-observed signal on an existing record key. */
export type CuratorSignalKind = "reinforce" | "contradict" | "override";

export interface CuratorSignal {
  kind: CuratorSignalKind;
  category: string;
  label: string;
  reason?: string;
  contextTags?: string[];
}

export function evidenceKindForSignal(kind: CuratorSignalKind): EvidenceKind {
  switch (kind) {
    case "reinforce":
      return "confirmed";
    case "contradict":
      return "contradicted";
    case "override":
      return "overridden";
  }
}
