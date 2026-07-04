import type { OwnerStore } from "./OwnerStore.js";
import type { PersonalAgentContext } from "./personalAgentContext.js";
import { formatRecordValue } from "./formatRecordValue.js";
import {
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_CATALOG_CATEGORY,
  BUSINESS_POLICY_CATEGORY,
  catalogItemsFromStore,
  type BusinessCatalogItemValue,
} from "./businessSchema.js";

export interface BusinessAgentContext {
  catalog: BusinessCatalogItemValue[];
  brandLines: string[];
  policyLines: string[];
}

export function buildBusinessAgentContext(store: OwnerStore): BusinessAgentContext {
  const records = store.list();
  const catalog = catalogItemsFromStore(records);
  const brandLines: string[] = [];
  const policyLines: string[] = [];

  for (const record of records) {
    if (record.guarded) continue;
    if (record.category === BUSINESS_BRAND_CATEGORY) {
      brandLines.push(`${record.label}: ${formatRecordValue(record.value)}`);
    }
    if (record.category === BUSINESS_POLICY_CATEGORY) {
      policyLines.push(`${record.label}: ${formatRecordValue(record.value)}`);
    }
  }

  return { catalog, brandLines, policyLines };
}

/** Prompt-oriented summary for AG-UI / LLM (M12.1). */
export function formatBusinessAgentContext(ctx: BusinessAgentContext): string {
  const lines: string[] = [];
  if (ctx.brandLines.length) {
    lines.push("Brand voice:", ...ctx.brandLines.map((l) => `- ${l}`));
  }
  if (ctx.policyLines.length) {
    lines.push("Policies:", ...ctx.policyLines.map((l) => `- ${l}`));
  }
  if (ctx.catalog.length) {
    lines.push(
      "Catalog:",
      ...ctx.catalog.map(
        (item) =>
          `- ${item.catalogItemId}: ${item.label} ${(item.amount.amountMinor / 100).toFixed(2)} ${item.amount.currency}${item.available ? "" : " (unavailable)"}`,
      ),
    );
  }
  return lines.join("\n");
}

/** Merge business owner-store context into an AG-UI profile slice (M12.1). */
export function mergeBusinessContextIntoProfile(
  store: OwnerStore,
  profile: PersonalAgentContext,
): PersonalAgentContext {
  const ctx = formatBusinessAgentContext(buildBusinessAgentContext(store));
  if (!ctx.trim()) return profile;
  return { ...profile, businessContext: ctx };
}
