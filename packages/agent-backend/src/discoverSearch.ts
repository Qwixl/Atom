import {
  attachHandlesToEntries,
  filterBusinessIndex,
  fetchBusinessIndex,
  fetchHandleIndex,
  type BusinessIndexEntry,
  type IndexEntryKind,
} from "@qwixl/business-index";
import { PRODUCTION_SHELL_ORIGIN } from "@qwixl/shell-core";
import type { AgentKeyPair } from "@qwixl/protocol";
import type { AgentBackendConfig } from "./config.js";
import { HandleCacheStore } from "./handleCache.js";
import {
  buildAgentCapabilities,
  resolveDiscoverEntry,
  type ResolvedDiscoverTarget,
} from "./serviceDiscovery.js";
import type { RoomStore } from "./roomStore.js";

export interface DiscoverSearchResult {
  entry: BusinessIndexEntry;
  resolved: ResolvedDiscoverTarget;
  indexLabel: string;
}

const DEFAULT_INDEXES = [
  { label: "Business", path: "/business-index/index.json" },
  { label: "Community", path: "/community-index/index.json" },
];

export interface DiscoverIndexRef {
  label: string;
  url: string;
}

function discoverIndexBaseUrl(): string {
  return (process.env.ATOM_DISCOVER_INDEX_BASE ?? PRODUCTION_SHELL_ORIGIN).replace(/\/$/, "");
}

function resolveIndexUrl(index: DiscoverIndexRef, base: string): string {
  const url = index.url.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

function normalizeIndexes(indexes: DiscoverIndexRef[] | undefined, base: string): DiscoverIndexRef[] {
  if (indexes && indexes.length > 0) {
    return indexes.map((row) => ({
      label: row.label,
      url: resolveIndexUrl(row, base),
    }));
  }
  return DEFAULT_INDEXES.map((row) => ({
    label: row.label,
    url: `${base}${row.path}`,
  }));
}

export async function runDiscoverSearch(opts: {
  terms: string;
  kind?: IndexEntryKind;
  config: AgentBackendConfig;
  identity: AgentKeyPair;
  rooms: RoomStore;
  businessDomain?: string | null;
  handleCache: HandleCacheStore;
  indexBaseUrl?: string;
  indexes?: DiscoverIndexRef[];
}): Promise<{ results: DiscoverSearchResult[]; summary: string }> {
  const terms = opts.terms.trim();
  const base = (opts.indexBaseUrl ?? discoverIndexBaseUrl()).replace(/\/$/, "");
  const indexList = normalizeIndexes(opts.indexes, base);
  const merged: Array<BusinessIndexEntry & { indexLabel: string }> = [];

  for (const index of indexList) {
    try {
      const body = await fetchBusinessIndex(index.url);
      const filtered = filterBusinessIndex(body, {
        terms: terms || undefined,
        kind: opts.kind,
      });
      for (const entry of filtered) {
        merged.push({ ...entry, indexLabel: index.label });
      }
    } catch {
      // Index unavailable — continue with other slices.
    }
  }

  let candidates = merged;
  try {
    const handleIndex = await fetchHandleIndex(`${base}/handles/index.json`);
    const withHandles = attachHandlesToEntries(merged, handleIndex.handles);
    candidates = withHandles.map((entry, index) => ({
      ...entry,
      indexLabel: merged[index]!.indexLabel,
    }));
  } catch {
    // Handle slice optional.
  }

  const localCapabilities = buildAgentCapabilities({
    config: opts.config,
    localDid: opts.identity.did,
    rooms: opts.rooms,
    businessDomain: opts.businessDomain,
  });

  const settled = await Promise.all(
    candidates.map(async (entry) => {
      try {
        const resolved = await resolveDiscoverEntry({
          entry,
          localCapabilities,
          handleCache: opts.handleCache,
        });
        return { entry, resolved, indexLabel: entry.indexLabel } satisfies DiscoverSearchResult;
      } catch {
        return null;
      }
    }),
  );

  const results = settled.filter((row): row is NonNullable<(typeof settled)[number]> => row !== null);

  let summary: string;
  if (results.length === 0) {
    summary =
      terms.length > 0
        ? `I couldn't find anything matching “${terms}”. Try Discover or different search words.`
        : "Nothing is available in Discover right now.";
  } else if (results.length === 1) {
    const name = results[0]!.entry.handle ?? results[0]!.entry.displayName;
    summary = `I found one place online: ${name}.`;
  } else {
    summary = `I found ${results.length} places online.`;
  }

  return { results, summary };
}
