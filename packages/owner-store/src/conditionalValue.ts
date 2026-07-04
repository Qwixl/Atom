import type { JsonValue } from "@qwixl/shell-core";
import type { OwnerRecord, RecordProposal } from "./OwnerStore.js";
import type { PreferenceEvidence } from "./evidence.js";
import { activeContextTags } from "./evidenceHelpers.js";
import { formatRecordValue } from "./formatRecordValue.js";

/** One contextual override on a record (evidence phase 4 / M10.6). */
export interface RecordCondition {
  /** All tags must be present in the active session context (AND). */
  contextTags: string[];
  value: JsonValue;
}

export function normalizeConditions(raw: readonly RecordCondition[] | undefined): RecordCondition[] {
  if (!raw?.length) return [];
  const out: RecordCondition[] = [];
  for (const item of raw) {
    const tags = item.contextTags
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length === 0) continue;
    out.push({ contextTags: tags, value: item.value });
  }
  return out;
}

/** Pick the most specific matching branch, else the record default. */
export function resolveRecordValue(
  record: Pick<OwnerRecord, "value" | "conditions">,
  sessionContextTags: readonly string[] = [],
): JsonValue {
  const conditions = record.conditions ?? [];
  if (conditions.length === 0) return record.value;
  const active = new Set(sessionContextTags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  let best: RecordCondition | null = null;
  let bestScore = 0;
  for (const condition of conditions) {
    const tags = condition.contextTags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.length === 0) continue;
    if (!tags.every((tag) => active.has(tag))) continue;
    if (tags.length > bestScore) {
      bestScore = tags.length;
      best = condition;
    }
  }
  return best?.value ?? record.value;
}

/**
 * True when incoming context tags suggest a different branch than tagged evidence
 * on the existing record (divergence trigger for conditional splits).
 */
export function hasTagContextConflict(
  record: OwnerRecord,
  incomingTags: readonly string[] | undefined,
): boolean {
  if (!incomingTags?.length) return false;
  const incoming = new Set(incomingTags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const evidence = record.evidence ?? [];
  const tagged = evidence.filter((e) => e.contextTags?.length);
  if (tagged.length === 0) return false;

  for (const event of tagged) {
    if (event.kind !== "overridden" && event.kind !== "contradicted") continue;
    const eventTags = event.contextTags!.map((t) => t.trim().toLowerCase());
    if (eventTags.some((t) => incoming.has(t))) return false;
  }

  const reinforced = new Set<string>();
  for (const event of tagged) {
    if (event.kind === "confirmed" || event.kind === "acted-on" || event.kind === "stated") {
      for (const tag of event.contextTags ?? []) reinforced.add(tag.trim().toLowerCase());
    }
  }
  if (reinforced.size === 0) return false;
  return ![...incoming].some((t) => reinforced.has(t));
}

export function formatConditionalValue(
  record: Pick<OwnerRecord, "value" | "conditions">,
): string {
  const conditions = record.conditions ?? [];
  if (conditions.length === 0) return formatRecordValue(record.value);
  const branches = conditions.map(
    (c) => `when [${c.contextTags.join(", ")}]: ${formatRecordValue(c.value)}`,
  );
  return `default: ${formatRecordValue(record.value)}; ${branches.join("; ")}`;
}

export function formatSplitProposal(proposal: RecordProposal): string {
  if (!proposal.splitConditions?.length) return formatRecordValue(proposal.value);
  const branches = proposal.splitConditions.map(
    (c) => `when [${c.contextTags.join(", ")}]: ${formatRecordValue(c.value)}`,
  );
  return `default: ${formatRecordValue(proposal.value)}; ${branches.join("; ")}`;
}

/** Heuristic: enough tagged divergence to suggest a curator split pass. */
export function evidenceHasTaggedDivergence(record: OwnerRecord): boolean {
  return (record.evidence ?? []).some(
    (event) =>
      (event.kind === "overridden" || event.kind === "contradicted") &&
      (event.contextTags?.length ?? 0) > 0,
  );
}

export function shouldProposeConditionalSplit(
  record: OwnerRecord,
  incomingValue: JsonValue,
  incomingTags: readonly string[] | undefined,
): boolean {
  if (JSON.stringify(record.value) === JSON.stringify(incomingValue)) return false;
  if ((record.conditions?.length ?? 0) > 0) return true;
  if (incomingTags?.length && evidenceHasTaggedDivergence(record)) return true;
  return hasTagContextConflict(record, incomingTags);
}

/** Heuristic: enough tagged divergence to suggest a curator split pass. */
export function evidenceSuggestsConditionalSplit(record: OwnerRecord): boolean {
  const evidence = record.evidence ?? [];
  const overrides = evidence.filter(
    (e) =>
      (e.kind === "overridden" || e.kind === "contradicted") &&
      (e.contextTags?.length ?? 0) > 0,
  );
  const reinforced = evidence.filter(
    (e) =>
      (e.kind === "confirmed" || e.kind === "acted-on" || e.kind === "stated") &&
      (e.contextTags?.length ?? 0) > 0,
  );
  if (overrides.length === 0 || reinforced.length === 0) return false;
  const overrideTags = new Set<string>();
  for (const event of overrides) {
    for (const tag of event.contextTags ?? []) overrideTags.add(tag.trim().toLowerCase());
  }
  for (const event of reinforced) {
    for (const tag of event.contextTags ?? []) {
      if (!overrideTags.has(tag.trim().toLowerCase())) return true;
    }
  }
  return false;
}

export function mergeConditions(
  existing: readonly RecordCondition[] | undefined,
  incoming: readonly RecordCondition[],
): RecordCondition[] {
  const merged = normalizeConditions(existing ?? []);
  for (const condition of normalizeConditions(incoming)) {
    const key = condition.contextTags.slice().sort().join("|");
    const idx = merged.findIndex(
      (c) => c.contextTags.slice().sort().join("|") === key,
    );
    if (idx === -1) merged.push(condition);
    else merged[idx] = condition;
  }
  return merged;
}

export function tagsFromEvidence(evidence: readonly PreferenceEvidence[]): string[] {
  return activeContextTags(evidence);
}
