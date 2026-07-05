import { loadJsonFromStorage, saveJsonToStorage } from "@qwixl/shell-core";

const DISCOVER_INDEXES_KEY = "atom-discover-indexes";

export interface DiscoverIndexConfig {
  label: string;
  url: string;
}

export const DEFAULT_DISCOVER_INDEXES: DiscoverIndexConfig[] = [
  { label: "Business", url: "/business-index/index.json" },
  { label: "Community", url: "/community-index/index.json" },
];

export const DEFAULT_HANDLE_INDEX_URL = "/handles/index.json";

export function loadDiscoverIndexes(): DiscoverIndexConfig[] {
  const parsed = loadJsonFromStorage<DiscoverIndexConfig[]>(DISCOVER_INDEXES_KEY);
  if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DISCOVER_INDEXES;
  return parsed.filter(
    (row): row is DiscoverIndexConfig =>
      typeof row?.label === "string" && typeof row?.url === "string" && row.url.trim().length > 0,
  );
}

export function saveDiscoverIndexes(indexes: DiscoverIndexConfig[]): void {
  saveJsonToStorage(DISCOVER_INDEXES_KEY, indexes);
}
