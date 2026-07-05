import {
  attachHandlesToEntries,
  filterBusinessIndex,
  fetchBusinessIndex,
  fetchHandleIndex,
  type BusinessIndexEntry,
  type IndexEntryKind,
} from "@qwixl/business-index";
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

function discoverIndexBaseUrl(): string {
  return (process.env.ATOM_DISCOVER_INDEX_BASE ?? "https://shell-atom.vercel.app").replace(/\/$/, "");
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
}): Promise<{ results: DiscoverSearchResult[]; summary: string }> {
  const terms = opts.terms.trim();
  const base = (opts.indexBaseUrl ?? discoverIndexBaseUrl()).replace(/\/$/, "");
  const merged: Array<BusinessIndexEntry & { indexLabel: string }> = [];

  for (const index of DEFAULT_INDEXES) {
    try {
      const body = await fetchBusinessIndex(`${base}${index.path}`);
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
        ? `Nothing online matched “${terms}”. Try Discover or start a community host locally.`
        : "Nothing is online in the default indexes right now.";
  } else if (results.length === 1) {
    const name = results[0]!.entry.handle ?? results[0]!.entry.displayName;
    summary = `I found one place online: ${name}.`;
  } else {
    summary = `I found ${results.length} places online.`;
  }

  return { results, summary };
}
