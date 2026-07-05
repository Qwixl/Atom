/** M12.1 business owner-store categories (D038). */
export const BUSINESS_CATALOG_CATEGORY = "business-catalog";
export const BUSINESS_POLICY_CATEGORY = "business-policy";
export const BUSINESS_BRAND_CATEGORY = "business-brand";
export const BUSINESS_KNOWLEDGE_CATEGORY = "business-knowledge";

export const BUSINESS_CATEGORIES = [
  BUSINESS_CATALOG_CATEGORY,
  BUSINESS_POLICY_CATEGORY,
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_KNOWLEDGE_CATEGORY,
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

/** Structured catalog item stored in OwnerRecord.value. */
export interface BusinessCatalogItemValue {
  catalogItemId: string;
  label: string;
  description?: string;
  amount: { currency: string; amountMinor: number };
  available: boolean;
  terms?: string[];
  tags?: string[];
  sponsored?: boolean;
  sponsoredRank?: number;
}

export function isBusinessCatalogItemValue(value: unknown): value is BusinessCatalogItemValue {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<BusinessCatalogItemValue>;
  return (
    typeof item.catalogItemId === "string" &&
    typeof item.label === "string" &&
    typeof item.amount === "object" &&
    item.amount !== null &&
    typeof (item.amount as { currency?: string }).currency === "string" &&
    typeof (item.amount as { amountMinor?: number }).amountMinor === "number" &&
    typeof item.available === "boolean"
  );
}

export function parseBusinessCatalogItem(recordValue: unknown): BusinessCatalogItemValue | null {
  if (typeof recordValue === "string") {
    try {
      const parsed = JSON.parse(recordValue) as unknown;
      return isBusinessCatalogItemValue(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isBusinessCatalogItemValue(recordValue) ? recordValue : null;
}

export function catalogItemsFromStore(
  records: ReadonlyArray<{ category: string; label: string; value: unknown }>,
): BusinessCatalogItemValue[] {
  const items: BusinessCatalogItemValue[] = [];
  for (const record of records) {
    if (record.category !== BUSINESS_CATALOG_CATEGORY) continue;
    const parsed = parseBusinessCatalogItem(record.value);
    if (parsed) items.push(parsed);
  }
  return items;
}
