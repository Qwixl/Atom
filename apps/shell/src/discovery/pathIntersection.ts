import { hashEmbedText, hybridRetrievalScore } from "@qwixl/owner-store";
import type { DiscoveryPath } from "./discoveryPath.js";
import { themeFromTitle } from "./interestConnections.js";

/** High-confidence overlap between the active path and a stored path (F7-4). */
export interface PathIntersection {
  activePathId: string;
  relatedPathId: string;
  relatedLabel: string;
  confidence: number;
  reasons: string[];
  sharedDomains: string[];
  sharedThemes: string[];
}

/** Prefer continuation: only propose when confidence clears this floor. */
export const PATH_INTERSECTION_MIN_CONFIDENCE = 0.72;

const DISMISSED_STORAGE_KEY = "atom.discovery.intersectionDismissed.v1";

function hostnameOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function pathDomains(path: DiscoveryPath): Set<string> {
  const domains = new Set<string>();
  for (const step of path.steps) {
    const host = hostnameOf(step.url);
    if (host) domains.add(host);
  }
  return domains;
}

function pathThemes(path: DiscoveryPath): Set<string> {
  const themes = new Set<string>();
  for (const theme of path.themes) {
    const normalized = theme.trim().toLowerCase();
    if (normalized) {
      themes.add(normalized);
      for (const token of normalized.split(/\s+/)) {
        if (token.length > 2) themes.add(token);
      }
    }
  }
  for (const step of path.steps) {
    const theme = themeFromTitle(step.title);
    if (theme) {
      themes.add(theme);
      for (const token of theme.split(/\s+/)) {
        if (token.length > 2) themes.add(token);
      }
    }
  }
  const labelTheme = themeFromTitle(path.label);
  if (labelTheme) {
    themes.add(labelTheme);
    for (const token of labelTheme.split(/\s+/)) {
      if (token.length > 2) themes.add(token);
    }
  }
  return themes;
}

function pathCorpus(path: DiscoveryPath): string {
  return [path.label, ...path.steps.map((step) => `${step.title} ${step.url}`)].join("\n");
}

function intersection(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((value) => b.has(value));
}

function pairKey(pathA: string, pathB: string): string {
  return pathA < pathB ? `${pathA}::${pathB}` : `${pathB}::${pathA}`;
}

export function loadDismissedIntersections(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function saveDismissedIntersections(keys: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...keys].slice(-200)));
}

export function markIntersectionDismissed(
  dismissed: ReadonlySet<string>,
  pathA: string,
  pathB: string,
): Set<string> {
  const next = new Set(dismissed);
  next.add(pairKey(pathA, pathB));
  saveDismissedIntersections(next);
  return next;
}

export function scorePathIntersection(
  active: DiscoveryPath,
  candidate: DiscoveryPath,
): PathIntersection | null {
  if (active.id === candidate.id) return null;
  if (active.steps.length === 0 || candidate.steps.length === 0) return null;

  const sharedDomains = intersection(pathDomains(active), pathDomains(candidate));
  const sharedThemes = intersection(pathThemes(active), pathThemes(candidate)).filter(
    (theme) => !theme.includes(" "),
  );
  const activeText = pathCorpus(active);
  const candidateText = pathCorpus(candidate);
  const signalCount = sharedThemes.length + sharedDomains.length * 2;
  const lexical = signalCount > 0 ? Math.min(1, signalCount / 5) : 0;
  const embedScore = hybridRetrievalScore(
    lexical,
    hashEmbedText(activeText),
    hashEmbedText(candidateText),
  );

  let confidence = embedScore;
  const reasons: string[] = [];
  if (sharedDomains.length > 0) {
    confidence = Math.min(1, confidence + 0.22 * Math.min(sharedDomains.length, 2));
    reasons.push(
      `shared domain${sharedDomains.length > 1 ? "s" : ""}: ${sharedDomains.slice(0, 2).join(", ")}`,
    );
  }
  if (sharedThemes.length > 0) {
    confidence = Math.min(1, confidence + 0.14 * Math.min(sharedThemes.length, 3));
    reasons.push(
      `shared theme${sharedThemes.length > 1 ? "s" : ""}: ${sharedThemes.slice(0, 3).join(", ")}`,
    );
  }
  if (embedScore >= 0.55 && reasons.length === 0) {
    reasons.push("similar exploration corpus");
  }

  if (confidence < PATH_INTERSECTION_MIN_CONFIDENCE) return null;
  // Continuation bias: require tangible shared signal, not embeddings alone,
  // unless embedding similarity is very high.
  if (sharedDomains.length === 0 && sharedThemes.length === 0 && embedScore < 0.85) {
    return null;
  }

  return {
    activePathId: active.id,
    relatedPathId: candidate.id,
    relatedLabel: candidate.label,
    confidence,
    reasons,
    sharedDomains,
    sharedThemes,
  };
}

/** Best high-confidence overlap for the active path; null when continuation should win. */
export function detectPathIntersection(
  active: DiscoveryPath | null | undefined,
  paths: readonly DiscoveryPath[],
  dismissed: ReadonlySet<string> = new Set(),
): PathIntersection | null {
  if (!active || active.steps.length === 0) return null;
  let best: PathIntersection | null = null;
  for (const candidate of paths) {
    if (candidate.id === active.id) continue;
    if (dismissed.has(pairKey(active.id, candidate.id))) continue;
    const hit = scorePathIntersection(active, candidate);
    if (!hit) continue;
    if (!best || hit.confidence > best.confidence) best = hit;
  }
  return best;
}

export function formatPathIntersectionForPrompt(hit: PathIntersection | null | undefined): string {
  if (!hit) return "";
  return `High-confidence path intersection with "${hit.relatedLabel}" (id ${hit.relatedPathId}, confidence ${hit.confidence.toFixed(2)}). Reasons: ${hit.reasons.join("; ") || "overlap"}.
After answering the owner's link intent, emit ONE composition (surfaceId "discovery-intersect") with core/choice options merge / keep-separate asking whether these paths relate. Do not auto-merge. Skip if you already asked for this pair.`;
}

export const PATH_INTERSECT_PROTOCOL = "[path-intersect]";

export function buildPathIntersectOwnerMessage(decision: "merge" | "keep-separate", hit: PathIntersection): string {
  return `${PATH_INTERSECT_PROTOCOL} ${JSON.stringify({
    decision,
    activePathId: hit.activePathId,
    relatedPathId: hit.relatedPathId,
    relatedLabel: hit.relatedLabel,
  })}`;
}

export function isPathIntersectProtocolMessage(text: string): boolean {
  return text.trimStart().toLowerCase().startsWith(PATH_INTERSECT_PROTOCOL.toLowerCase());
}

/** Merge related path steps onto the active path (dedupe by URL), keep active id. */
export function mergeDiscoveryPaths(
  paths: readonly DiscoveryPath[],
  activePathId: string,
  relatedPathId: string,
): DiscoveryPath[] {
  const active = paths.find((path) => path.id === activePathId);
  const related = paths.find((path) => path.id === relatedPathId);
  if (!active || !related) return [...paths];

  const seen = new Set(active.steps.map((step) => step.url));
  const appended = related.steps.filter((step) => {
    if (seen.has(step.url)) return false;
    seen.add(step.url);
    return true;
  });
  const themes = [...new Set([...active.themes, ...related.themes, related.label])];
  const merged: DiscoveryPath = {
    ...active,
    steps: [...active.steps, ...appended],
    themes,
  };
  return paths
    .filter((path) => path.id !== relatedPathId)
    .map((path) => (path.id === activePathId ? merged : path));
}
