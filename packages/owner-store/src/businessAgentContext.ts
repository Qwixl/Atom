import type { JsonValue } from "@qwixl/shell-core";
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
  const { brandLines, policyLines } = brandPolicyLinesFromRecords(records);
  return { catalog, brandLines, policyLines };
}

/** Build brand/policy prompt lines from persisted business context records (M12.1). */
export function brandPolicyLinesFromRecords(
  records: ReadonlyArray<{ category: string; label: string; value: unknown; guarded?: boolean }>,
): Pick<BusinessAgentContext, "brandLines" | "policyLines"> {
  const brandLines: string[] = [];
  const policyLines: string[] = [];

  for (const record of records) {
    if (record.guarded) continue;
    if (record.category === BUSINESS_BRAND_CATEGORY) {
      brandLines.push(`${record.label}: ${formatRecordValue(record.value as JsonValue)}`);
    }
    if (record.category === BUSINESS_POLICY_CATEGORY) {
      policyLines.push(`${record.label}: ${formatRecordValue(record.value as JsonValue)}`);
    }
  }

  return { brandLines, policyLines };
}

/** Prompt-oriented summary for AG-UI / LLM (M12.1). */
export function formatBusinessAgentContext(ctx: BusinessAgentContext): string {
  return formatBusinessAgentPrompt({
    catalog: ctx.catalog,
    brandLines: ctx.brandLines,
    knowledgeSnippets: ctx.policyLines.map((line) => `policy: ${line}`),
  });
}

/** M12.8 — brand voice always on; catalog summary; policies/docs retrieved per turn. */
export function formatBusinessAgentPrompt(input: {
  catalog: BusinessCatalogItemValue[];
  brandLines: string[];
  knowledgeSnippets: string[];
}): string {
  const lines: string[] = [];
  if (input.brandLines.length) {
    lines.push("Brand voice (always apply):", ...input.brandLines.map((l) => `- ${l}`));
  }
  if (input.knowledgeSnippets.length) {
    lines.push(
      "Retrieved business reference (cite accurately; do not invent beyond these excerpts):",
      ...input.knowledgeSnippets.map((snippet, index) => `${index + 1}. ${snippet}`),
    );
  }
  if (input.catalog.length) {
    lines.push(
      "Catalog:",
      ...input.catalog.map(
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
