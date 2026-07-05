import type { BusinessCatalogItemValue } from "@qwixl/owner-store";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const CATALOG_FILE = "business-catalog.json";
const SCHEMA_VERSION = 1;

interface CatalogFile {
  schemaVersion: number;
  items: BusinessCatalogItemValue[];
}

export class BusinessCatalogStore {
  private readonly items = new Map<string, BusinessCatalogItemValue>();
  private readonly filePath: string;

  constructor(filePath = resolveDataPath(CATALOG_FILE)) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<CatalogFile>(this.filePath);
    if (!file?.items?.length) return;
    this.items.clear();
    for (const item of file.items) {
      this.items.set(item.catalogItemId, item);
    }
  }

  list(): BusinessCatalogItemValue[] {
    return [...this.items.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  get(catalogItemId: string): BusinessCatalogItemValue | undefined {
    return this.items.get(catalogItemId);
  }

  upsert(item: BusinessCatalogItemValue): BusinessCatalogItemValue {
    this.items.set(item.catalogItemId, item);
    void this.persist();
    return item;
  }

  remove(catalogItemId: string): boolean {
    const removed = this.items.delete(catalogItemId);
    if (removed) void this.persist();
    return removed;
  }

  replaceAll(items: BusinessCatalogItemValue[]): void {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.catalogItemId, item);
    }
    void this.persist();
  }

  private async persist(): Promise<void> {
    const payload: CatalogFile = {
      schemaVersion: SCHEMA_VERSION,
      items: this.list(),
    };
    await atomicWriteJson(this.filePath, payload);
  }
}
