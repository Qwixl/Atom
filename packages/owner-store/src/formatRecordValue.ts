import type { JsonValue } from "@qwixl/shell-core";

/** Human-readable display for owner record / proposal values. */
export function formatRecordValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}
