import { scoreTokenOverlap } from "./conversationMemory.js";
import type { BusinessCatalogItemValue } from "./businessSchema.js";

export interface CatalogIntentMatchInput {
  catalogItemId?: string;
  query?: string;
  constraints?: { maxAmountMinor?: number; currency?: string };
}

export interface CatalogMatchResult {
  item: BusinessCatalogItemValue;
  score: number;
}

function intentQuery(intent: CatalogIntentMatchInput): string {
  const parts = [intent.catalogItemId ?? "", intent.query ?? ""].filter(Boolean);
  return parts.join(" ");
}

function itemSearchText(item: BusinessCatalogItemValue): string {
  return [item.catalogItemId, item.label, item.description ?? "", ...(item.tags ?? [])].join(" ");
}

function withinConstraints(
  item: BusinessCatalogItemValue,
  constraints?: CatalogIntentMatchInput["constraints"],
): boolean {
  if (!constraints) return true;
  if (constraints.currency && item.amount.currency !== constraints.currency.toUpperCase()) {
    return false;
  }
  if (
    typeof constraints.maxAmountMinor === "number" &&
    item.amount.amountMinor > constraints.maxAmountMinor
  ) {
    return false;
  }
  return true;
}

/** Match inbound commerce intent against catalog items (M12.3). */
export function matchCatalogForIntent(
  catalog: readonly BusinessCatalogItemValue[],
  intent: CatalogIntentMatchInput,
): CatalogMatchResult | undefined {
  const available = catalog.filter((item) => item.available && withinConstraints(item, intent.constraints));
  if (available.length === 0) return undefined;

  const catalogItemId = intent.catalogItemId?.trim();
  if (catalogItemId) {
    const exact = available.find((item) => item.catalogItemId === catalogItemId);
    if (exact) return { item: exact, score: 1 };
  }

  const query = intentQuery(intent).trim();
  if (!query) return undefined;

  let best: CatalogMatchResult | undefined;
  for (const item of available) {
    const score = scoreTokenOverlap(query, itemSearchText(item));
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best;
}
