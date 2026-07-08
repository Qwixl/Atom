/** F7-3: weighted edges between discovery themes (Streams connection port). */

export type InterestConnectionKind =
  | "tangent"
  | "return"
  | "explicit"
  | "manual";

export interface InterestConnection {
  id: string;
  /** Normalized theme A (lexicographically sorted with themeB for undirected identity). */
  themeA: string;
  themeB: string;
  strength: number;
  kind: InterestConnectionKind;
  updatedAt: number;
  /** Optional discovery path that last touched this edge. */
  pathId?: string;
  /** How many times this edge was reinforced. */
  hits: number;
}

export const INTEREST_DELTA: Record<InterestConnectionKind, number> = {
  tangent: 1.0,
  return: 0.5,
  explicit: 2.0,
  manual: 10.0,
};

const STORAGE_KEY = "atom.discovery.interestConnections.v1";
const MAX_CONNECTIONS = 200;
const MAX_STRENGTH = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId(): string {
  return `ic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lowercase kebab-ish theme label for edge keys. */
export function normalizeTheme(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

/** Coarse theme from a headline/path label (first meaningful tokens). */
export function themeFromTitle(title: string): string {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "as",
    "is",
    "are",
    "with",
    "from",
    "after",
    "before",
    "update",
    "news",
    "says",
    "amid",
  ]);
  const tokens = normalizeTheme(title)
    .split(" ")
    .filter((token) => token.length > 2 && !stop.has(token));
  if (tokens.length === 0) return normalizeTheme(title) || "untitled";
  return tokens.slice(0, 4).join(" ");
}

function orderedPair(a: string, b: string): [string, string] | null {
  const themeA = normalizeTheme(a);
  const themeB = normalizeTheme(b);
  if (!themeA || !themeB || themeA === themeB) return null;
  return themeA < themeB ? [themeA, themeB] : [themeB, themeA];
}

function edgeKey(themeA: string, themeB: string): string {
  return `${themeA}::${themeB}`;
}

function normalizeConnection(raw: unknown): InterestConnection | null {
  if (!isRecord(raw)) return null;
  const themeA = typeof raw.themeA === "string" ? normalizeTheme(raw.themeA) : "";
  const themeB = typeof raw.themeB === "string" ? normalizeTheme(raw.themeB) : "";
  if (!themeA || !themeB || themeA === themeB) return null;
  const [a, b] = orderedPair(themeA, themeB) ?? [themeA, themeB];
  const kind =
    raw.kind === "tangent" ||
    raw.kind === "return" ||
    raw.kind === "explicit" ||
    raw.kind === "manual"
      ? raw.kind
      : "tangent";
  const strength =
    typeof raw.strength === "number" && Number.isFinite(raw.strength)
      ? Math.min(MAX_STRENGTH, Math.max(0, raw.strength))
      : INTEREST_DELTA[kind];
  return {
    id: typeof raw.id === "string" ? raw.id : newId(),
    themeA: a,
    themeB: b,
    strength,
    kind,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    pathId: typeof raw.pathId === "string" ? raw.pathId : undefined,
    hits: typeof raw.hits === "number" && raw.hits > 0 ? Math.floor(raw.hits) : 1,
  };
}

export function loadInterestConnections(): InterestConnection[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeConnection)
      .filter((c): c is InterestConnection => c !== null)
      .slice(-MAX_CONNECTIONS);
  } catch {
    return [];
  }
}

export function saveInterestConnections(connections: readonly InterestConnection[]): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = [...connections]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-MAX_CONNECTIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export interface StrengthenInterestInput {
  themeA: string;
  themeB: string;
  kind: InterestConnectionKind;
  pathId?: string;
  /** Override delta; defaults to INTEREST_DELTA[kind]. */
  delta?: number;
}

export function strengthenInterestConnection(
  connections: readonly InterestConnection[],
  input: StrengthenInterestInput,
): { connections: InterestConnection[]; edge: InterestConnection | null } {
  const pair = orderedPair(input.themeA, input.themeB);
  if (!pair) return { connections: [...connections], edge: null };
  const [themeA, themeB] = pair;
  const key = edgeKey(themeA, themeB);
  const delta = input.delta ?? INTEREST_DELTA[input.kind];
  const existing = connections.find((c) => edgeKey(c.themeA, c.themeB) === key);
  const now = Date.now();
  if (existing) {
    const edge: InterestConnection = {
      ...existing,
      strength: Math.min(MAX_STRENGTH, existing.strength + delta),
      kind: input.kind === "manual" || input.kind === "explicit" ? input.kind : existing.kind,
      updatedAt: now,
      pathId: input.pathId ?? existing.pathId,
      hits: existing.hits + 1,
    };
    return {
      connections: connections.map((c) => (c.id === existing.id ? edge : c)),
      edge,
    };
  }
  const edge: InterestConnection = {
    id: newId(),
    themeA,
    themeB,
    strength: Math.min(MAX_STRENGTH, delta),
    kind: input.kind,
    updatedAt: now,
    pathId: input.pathId,
    hits: 1,
  };
  return { connections: [...connections, edge], edge };
}

/** Strongest edges first for agent / briefing injection. */
export function rankInterestConnections(
  connections: readonly InterestConnection[],
  limit = 8,
): InterestConnection[] {
  return [...connections]
    .filter((c) => c.strength > 0)
    .sort((a, b) => b.strength - a.strength || b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** Theme labels weighted by graph degree × edge strength (emerging interests). */
export function emergingInterestThemes(
  connections: readonly InterestConnection[],
  limit = 5,
): Array<{ theme: string; score: number }> {
  const scores = new Map<string, number>();
  for (const edge of connections) {
    scores.set(edge.themeA, (scores.get(edge.themeA) ?? 0) + edge.strength);
    scores.set(edge.themeB, (scores.get(edge.themeB) ?? 0) + edge.strength);
  }
  return [...scores.entries()]
    .map(([theme, score]) => ({ theme, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatInterestConnectionsForPrompt(
  connections: readonly InterestConnection[],
  limit = 8,
): string {
  const ranked = rankInterestConnections(connections, limit);
  if (ranked.length === 0) return "";
  const lines = ranked.map(
    (edge) =>
      `- ${edge.themeA} ↔ ${edge.themeB} (strength ${edge.strength.toFixed(1)}, ${edge.kind}, hits ${edge.hits})`,
  );
  const emerging = emergingInterestThemes(connections, 5)
    .map((entry) => entry.theme)
    .join(", ");
  return `Interest connections (weighted theme edges from link exploration):
${lines.join("\n")}
Emerging themes: ${emerging || "(none yet)"}`;
}

/** Suggest briefing topic strings from strong graph themes not already listed. */
export function briefingTopicsFromInterestGraph(
  connections: readonly InterestConnection[],
  existingTopics: readonly string[],
  limit = 3,
): string[] {
  const existing = new Set(existingTopics.map((t) => normalizeTheme(t)));
  return emergingInterestThemes(connections, limit + existing.size)
    .map((entry) => entry.theme)
    .filter((theme) => theme && !existing.has(normalizeTheme(theme)))
    .slice(0, limit);
}
