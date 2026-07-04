import type { BusinessCatalogItemValue } from "@qwixl/owner-store";

export class BusinessCatalogStore {
  private readonly items = new Map<string, BusinessCatalogItemValue>();

  list(): BusinessCatalogItemValue[] {
    return [...this.items.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  get(catalogItemId: string): BusinessCatalogItemValue | undefined {
    return this.items.get(catalogItemId);
  }

  upsert(item: BusinessCatalogItemValue): BusinessCatalogItemValue {
    this.items.set(item.catalogItemId, item);
    return item;
  }

  remove(catalogItemId: string): boolean {
    return this.items.delete(catalogItemId);
  }

  replaceAll(items: BusinessCatalogItemValue[]): void {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.catalogItemId, item);
    }
  }
}
