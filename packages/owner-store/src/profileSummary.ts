import type { JsonValue } from "@atom/shell-core";
import type { ProfileContextOpenRecord } from "./OwnerStore.js";

/** Compact category → label → value map so the model sees one picture, not 18 scattered rows. */
export function buildProfileSummaryByCategory(
  open: readonly ProfileContextOpenRecord[],
): Record<string, Record<string, JsonValue>> {
  const summary: Record<string, Record<string, JsonValue>> = {};
  for (const record of open) {
    const bucket = summary[record.category] ?? {};
    bucket[record.label] = record.value;
    summary[record.category] = bucket;
  }
  return summary;
}
