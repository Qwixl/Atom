/** Federated business index entry (M15.7). Static signed index; client-side filter only in v1. */
export type IndexEntryKind = "business" | "community" | "developer";

export interface BusinessIndexEntry {
  /** Optional static hint; prefer businessDomain + moduleIds for resolution. */
  agentCardUrl?: string;
  /** Optional index hint; live DID is resolved at connect time. */
  did?: string;
  businessDomain: string;
  verificationTier: number;
  tierLabel?: string;
  categories: string[];
  serviceArea?: string;
  displayName: string;
  sponsored?: boolean;
  sponsoredRank?: number;
  /** M19.1 — entry kind for Discover panel actions. */
  kind?: IndexEntryKind;
  /** Module ids this agent publishes or renders. */
  moduleIds?: string[];
  /** Joinable room ids hosted by this agent. */
  roomIds?: string[];
  /** Publisher DID linking agent listing to registry modules. */
  publisherDid?: string;
  /** M20 — human-facing @handle (e.g. @coffee-shop). */
  handle?: string;
  /** Admin API base for join-room (community hosts). */
  hostUrl?: string;
}

export interface HandleIndexEntry {
  handle: string;
  agentDid?: string;
  businessDomain?: string;
  moduleIds?: string[];
  roomIds?: string[];
  displayName?: string;
}

export interface HandleIndex {
  indexVersion: number;
  updatedAt: string;
  handles: HandleIndexEntry[];
}

export interface BusinessIndex {
  indexVersion: number;
  updatedAt: string;
  revocationsUrl?: string;
  businesses: BusinessIndexEntry[];
}

export interface BusinessQuery {
  categories?: string[];
  terms?: string;
  serviceArea?: string;
  kind?: IndexEntryKind | IndexEntryKind[];
}

export interface QueryBusinessIndexOptions {
  maxResults?: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Normalize to lowercase @handle form. */
export function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

/** Attach handles from a handle index slice onto discover entries by domain or module id. */
export function attachHandlesToEntries(
  entries: BusinessIndexEntry[],
  handles: HandleIndexEntry[],
): BusinessIndexEntry[] {
  const byDomain = new Map<string, HandleIndexEntry>();
  const byModule = new Map<string, HandleIndexEntry>();
  for (const row of handles) {
    if (row.businessDomain?.trim()) {
      byDomain.set(normalize(row.businessDomain), row);
    }
    for (const moduleId of row.moduleIds ?? []) {
      byModule.set(moduleId, row);
    }
  }
  return entries.map((entry) => {
    if (entry.handle?.trim()) {
      return { ...entry, handle: normalizeHandle(entry.handle) };
    }
    const fromDomain = entry.businessDomain ? byDomain.get(normalize(entry.businessDomain)) : undefined;
    const fromModule = entry.moduleIds?.map((id) => byModule.get(id)).find(Boolean);
    const match = fromDomain ?? fromModule;
    if (!match) return entry;
    return { ...entry, handle: normalizeHandle(match.handle) };
  });
}

/** Default ranking: verification tier desc, then neutral alphabetical by displayName. */
export function rankBusinessEntries(entries: BusinessIndexEntry[]): BusinessIndexEntry[] {
  return [...entries].sort((a, b) => {
    if (b.verificationTier !== a.verificationTier) return b.verificationTier - a.verificationTier;
    if (Boolean(b.sponsored) !== Boolean(a.sponsored)) return Number(b.sponsored) - Number(a.sponsored);
    if ((a.sponsoredRank ?? 0) !== (b.sponsoredRank ?? 0)) {
      return (b.sponsoredRank ?? 0) - (a.sponsoredRank ?? 0);
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function filterBusinessIndex(
  index: BusinessIndex,
  query: BusinessQuery,
  options: QueryBusinessIndexOptions = {},
): BusinessIndexEntry[] {
  const terms = query.terms ? normalize(query.terms) : "";
  const categories = query.categories?.map(normalize) ?? [];
  const area = query.serviceArea ? normalize(query.serviceArea) : "";
  const kindFilter = query.kind
    ? Array.isArray(query.kind)
      ? query.kind
      : [query.kind]
    : null;

  let matches = index.businesses.filter((entry) => {
    if (kindFilter && !kindFilter.includes(entry.kind ?? "business")) return false;
    if (categories.length > 0) {
      const entryCats = entry.categories.map(normalize);
      if (!categories.some((c) => entryCats.includes(c))) return false;
    }
    if (area && entry.serviceArea && !normalize(entry.serviceArea).includes(area)) return false;
    if (terms) {
      const haystack = [
        entry.displayName,
        entry.handle ?? "",
        entry.businessDomain,
        entry.serviceArea ?? "",
        ...entry.categories,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(terms)) return false;
    }
    return true;
  });

  matches = rankBusinessEntries(matches);
  const max = options.maxResults ?? 20;
  return matches.slice(0, max);
}

export async function fetchBusinessIndex(indexUrl: string): Promise<BusinessIndex> {
  const resp = await fetch(indexUrl);
  if (!resp.ok) throw new Error(`Business index fetch failed: ${resp.status}`);
  const index = (await resp.json()) as BusinessIndex;
  if (index.indexVersion !== 1 || !Array.isArray(index.businesses)) {
    throw new Error("Invalid business index format");
  }
  return index;
}

export async function fetchHandleIndex(indexUrl: string): Promise<HandleIndex> {
  const resp = await fetch(indexUrl);
  if (!resp.ok) throw new Error(`Handle index fetch failed: ${resp.status}`);
  const index = (await resp.json()) as HandleIndex;
  if (index.indexVersion !== 1 || !Array.isArray(index.handles)) {
    throw new Error("Invalid handle index format");
  }
  return index;
}
