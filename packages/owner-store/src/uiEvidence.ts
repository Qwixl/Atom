import type { JsonValue, UiEvent } from "@atom/shell-core";
import type { OwnerStore } from "./OwnerStore.js";

function normalizeFieldKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function uiValueText(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  return JSON.stringify(value).toLowerCase();
}

function recordValueText(value: JsonValue): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  return JSON.stringify(value).toLowerCase();
}

function valuesAlign(recordValue: JsonValue, uiValue: unknown): boolean {
  const a = recordValueText(recordValue);
  const b = uiValueText(uiValue);
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function findRecordForField(
  store: OwnerStore,
  fieldName: string,
): ReturnType<OwnerStore["list"]>[number] | null {
  const norm = normalizeFieldKey(fieldName);
  return (
    store.list().find((record) => {
      if (record.label === norm) return true;
      if (record.label.includes(norm) || norm.includes(record.label)) return true;
      const categoryNorm = record.category.replace(/[\s_]+/g, "-");
      return norm.includes(categoryNorm) && norm.length > categoryNorm.length + 2;
    }) ?? null
  );
}

function findRecordForOption(
  store: OwnerStore,
  optionId: string,
): ReturnType<OwnerStore["list"]>[number] | null {
  const opt = optionId.trim().toLowerCase();
  return (
    store
      .list()
      .find(
        (record) =>
          valuesAlign(record.value, optionId) ||
          recordValueText(record.value).includes(opt) ||
          record.label.includes(opt),
      ) ?? null
  );
}

/**
 * Record acted-on / overridden evidence when the owner interacts with agent UI.
 * Heuristic field → record matching; improves weights without extra questions.
 */
export function recordUiPreferenceFeedback(store: OwnerStore, event: UiEvent): number {
  let applied = 0;

  if (event.name === "submitted" && event.payload && typeof event.payload === "object") {
    const values = (event.payload as { values?: Record<string, unknown> }).values;
    if (values && typeof values === "object") {
      for (const [field, value] of Object.entries(values)) {
        const record = findRecordForField(store, field);
        if (!record || record.guarded) continue;
        const kind = valuesAlign(record.value, value) ? "acted-on" : "overridden";
        if (store.appendEvidence(record.id, kind, `UI submitted: ${field}`)) applied++;
      }
    }
  }

  if (event.name === "selected" && event.payload && typeof event.payload === "object") {
    const optionId = (event.payload as { optionId?: unknown }).optionId;
    if (typeof optionId === "string") {
      const record = findRecordForOption(store, optionId);
      if (record && !record.guarded) {
        const kind = valuesAlign(record.value, optionId) ? "acted-on" : "overridden";
        if (store.appendEvidence(record.id, kind, `UI selected: ${optionId}`)) applied++;
      }
    }
  }

  return applied;
}
