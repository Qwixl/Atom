import type { JsonValue } from "@qwixl/shell-core";
import {
  type CuratorSignal,
  derivePreferenceWeights,
  evidenceKindForSignal,
  type PreferenceEvidence,
} from "./evidence.js";
import {
  formatConditionalValue,
  hasTagContextConflict,
  mergeConditions,
  normalizeConditions,
  resolveRecordValue,
  shouldProposeConditionalSplit,
  type RecordCondition,
} from "./conditionalValue.js";
import { appendEvidence, activeContextTags, normalizeEvidence } from "./evidenceHelpers.js";
import { buildProfileSummaryByCategory } from "./profileSummary.js";
import { inferTier, resolveTier, type PreferenceTier } from "./tier.js";

export type { RecordCondition };

/**
 * One owner-held fact: an identity detail, a stated preference, a piece of
 * interaction history. Data-object-shaped: portable, self-describing,
 * owner-controlled. The store is deliberately independent of any shell,
 * agent, or model — it can be exported wholesale and pointed at a
 * different shell.
 */
export interface OwnerRecord {
  id: string;
  /** e.g. "identity", "preferences", "travel-history", "payment". */
  category: string;
  /** Human-readable label, e.g. "Home city" or "Aisle or window seat". */
  label: string;
  value: JsonValue;
  /**
   * Guarded records are never disclosed to a model or counterpart without
   * an explicit, per-interaction owner approval in shell chrome.
   */
  guarded: boolean;
  updated: number;
  /** Append-only observations; confidence/strength derived at read time. */
  evidence?: PreferenceEvidence[];
  /** Stakes classification: constraint (hard rule), preference (durable default), taste (ephemeral). */
  tier?: PreferenceTier;
  /** Contextual overrides when evidence diverges by tags (M10.6). */
  conditions?: RecordCondition[];
}

/** Agent-proposed record awaiting owner approval in the profile panel. */
export interface RecordProposal {
  id: string;
  category: string;
  label: string;
  value: JsonValue;
  guarded: boolean;
  reason?: string;
  contextTags?: string[];
  tier?: PreferenceTier;
  proposedAt: number;
  /** When set, accepting applies conditional branches instead of a flat value replace (M10.6). */
  splitConditions?: RecordCondition[];
}

/** Categories that default to guarded on curator capture (fail-safe). */
export const GUARD_BY_DEFAULT_CATEGORIES = new Set([
  "identity",
  "payment",
  "commerce-receipts",
  "health",
  "credentials",
  "trusted-agents",
]);

export function defaultGuardForCategory(category: string): boolean {
  return GUARD_BY_DEFAULT_CATEGORIES.has(category.trim().toLowerCase());
}

export interface ProfileContextOpenRecord {
  category: string;
  label: string;
  /** Value resolved for the active session context tags. */
  value: JsonValue;
  /** Default when no conditional branch matches. */
  defaultValue?: JsonValue;
  confidence: number;
  strength: number;
  tier: PreferenceTier;
  /** Recent context tags from evidence (e.g. traveling-with-family). */
  contextTags: string[];
  /** Conditional branches, when present (M10.6). */
  conditions?: RecordCondition[];
}

/**
 * The context slice handed to an agent session at assembly time. Open
 * records travel inline with derived weights; guarded material travels as
 * category names only.
 */
export interface ProfileContext {
  open: ProfileContextOpenRecord[];
  guardedCategories: string[];
  /** Grouped view of open records — easier for the model to apply holistically. */
  summaryByCategory: Record<string, Record<string, JsonValue>>;
}

export class OwnerStore {
  private records = new Map<string, OwnerRecord>();
  private proposals = new Map<string, RecordProposal>();
  private persist?: (records: readonly OwnerRecord[]) => void;
  private persistProposals?: (proposals: readonly RecordProposal[]) => void;
  private counter = 0;
  private proposalCounter = 0;

  constructor(options?: {
    persist?: (records: readonly OwnerRecord[]) => void;
    restore?: OwnerRecord[];
    persistProposals?: (proposals: readonly RecordProposal[]) => void;
    restoreProposals?: RecordProposal[];
  }) {
    this.persist = options?.persist;
    this.persistProposals = options?.persistProposals;
    let migratedEvidence = false;
    let migratedTier = false;
    for (const record of options?.restore ?? []) {
      let evidence = normalizeEvidence(record.evidence);
      if (evidence.length === 0) {
        const at = record.updated || Date.now();
        evidence = [
          { kind: "stated", at },
          { kind: "confirmed", at, note: "restored from owner store" },
        ];
        migratedEvidence = true;
      } else if (!evidence.some((e) => e.kind === "confirmed" || e.kind === "acted-on")) {
        evidence = [
          ...evidence,
          {
            kind: "confirmed",
            at: record.updated || Date.now(),
            note: "persisted in owner store",
          },
        ];
        migratedEvidence = true;
      }
      const tier = record.tier ?? inferTier(record);
      if (!record.tier) migratedTier = true;
      this.records.set(record.id, {
        ...record,
        evidence,
        tier,
      });
    }
    if (migratedEvidence || migratedTier) this.save();
    for (const proposal of options?.restoreProposals ?? []) {
      this.proposals.set(proposal.id, proposal);
    }
    this.consolidateDuplicateLabels();
  }

  upsert(input: {
    id?: string;
    category: string;
    label: string;
    value: JsonValue;
    guarded?: boolean;
    evidenceNote?: string;
    contextTags?: string[];
    tier?: PreferenceTier;
  }): OwnerRecord {
    const category = input.category.trim().toLowerCase();
    const label = input.label.trim();
    let id = input.id;
    if (!id) {
      const match = this.list().find(
        (record) => record.category === category && record.label === label,
      );
      id = match?.id ?? `rec-${Date.now()}-${++this.counter}`;
    }
    const existing = this.records.get(id);
    const valueChanged =
      existing !== undefined && JSON.stringify(existing.value) !== JSON.stringify(input.value);
    let evidence = existing?.evidence ?? [];
    if (!existing) {
      evidence = appendEvidence(evidence, "stated", input.evidenceNote, input.contextTags);
    } else if (valueChanged) {
      evidence = appendEvidence(evidence, "contradicted", input.evidenceNote ?? "value updated");
      evidence = appendEvidence(evidence, "stated", input.evidenceNote ?? "updated value");
    }
    const tier = resolveTier(input.tier ?? existing?.tier, {
      category,
      label,
      value: input.value,
    });
    const record: OwnerRecord = {
      id,
      category,
      label,
      value: input.value,
      guarded: input.guarded ?? existing?.guarded ?? false,
      updated: Date.now(),
      evidence,
      tier,
    };
    this.records.set(id, record);
    this.save();
    return record;
  }

  propose(input: {
    category: string;
    label: string;
    value: JsonValue;
    guarded?: boolean;
    reason?: string;
    contextTags?: string[];
    tier?: PreferenceTier;
    splitConditions?: RecordCondition[];
  }): RecordProposal {
    const duplicate = this.listProposals().find(
      (p) =>
        p.category === input.category.trim().toLowerCase() &&
        p.label === input.label.trim() &&
        JSON.stringify(p.value) === JSON.stringify(input.value),
    );
    if (duplicate) return duplicate;

    const category = input.category.trim().toLowerCase();
    const label = input.label.trim();
    const tier = resolveTier(input.tier, { category, label, value: input.value });
    const proposal: RecordProposal = {
      id: `prop-${Date.now()}-${++this.proposalCounter}`,
      category,
      label,
      value: input.value,
      guarded: input.guarded ?? defaultGuardForCategory(category),
      reason: input.reason?.trim(),
      contextTags: input.contextTags
        ?.map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      tier,
      proposedAt: Date.now(),
      splitConditions: input.splitConditions
        ? normalizeConditions(input.splitConditions)
        : undefined,
    };
    this.proposals.set(proposal.id, proposal);
    this.saveProposals();
    return proposal;
  }

  /**
   * Curator ingest: reinforce an existing record when the fact is already stored,
   * queue a proposal only for genuinely new or changed values.
   */
  ingestCuratorProposal(input: {
    category: string;
    label: string;
    value: JsonValue;
    guarded?: boolean;
    reason?: string;
    contextTags?: string[];
    tier?: PreferenceTier;
  }): RecordProposal | null {
    const category = input.category.trim().toLowerCase();
    const label = input.label.trim();
    const labelKey = label.toLowerCase();

    const exact = this.list().find((r) => r.category === category && r.label === label);
    const sameLabel =
      exact ??
      this.list().find((r) => r.label.trim().toLowerCase() === labelKey);

    if (sameLabel && JSON.stringify(sameLabel.value) === JSON.stringify(input.value)) {
      this.appendEvidence(sameLabel.id, "confirmed", input.reason, input.contextTags);
      return null;
    }

    if (
      sameLabel &&
      JSON.stringify(sameLabel.value) !== JSON.stringify(input.value) &&
      shouldProposeConditionalSplit(sameLabel, input.value, input.contextTags)
    ) {
      return this.proposeConditionalSplit({
        category: sameLabel.category,
        label: sameLabel.label,
        defaultValue: sameLabel.value,
        conditions: [{ contextTags: input.contextTags ?? [], value: input.value }],
        reason: input.reason ?? "Context-specific value diverges from default",
        guarded: input.guarded ?? sameLabel.guarded,
        tier: input.tier ?? sameLabel.tier,
      });
    }

    return this.propose(input);
  }

  /** Queue a conditional split for owner approval (M10.6). */
  proposeConditionalSplit(input: {
    category: string;
    label: string;
    defaultValue: JsonValue;
    conditions: RecordCondition[];
    reason?: string;
    guarded?: boolean;
    tier?: PreferenceTier;
  }): RecordProposal | null {
    const conditions = normalizeConditions(input.conditions);
    if (conditions.length === 0) return null;
    const duplicate = this.listProposals().find(
      (p) =>
        p.category === input.category.trim().toLowerCase() &&
        p.label === input.label.trim() &&
        p.splitConditions?.length,
    );
    if (duplicate) return duplicate;
    return this.propose({
      category: input.category,
      label: input.label,
      value: input.defaultValue,
      guarded: input.guarded,
      reason: input.reason,
      tier: input.tier,
      splitConditions: conditions,
    });
  }

  /** Apply conditional branches to an existing record. */
  applyConditions(id: string, conditions: readonly RecordCondition[]): OwnerRecord | null {
    const existing = this.records.get(id);
    if (!existing) return null;
    const merged = mergeConditions(existing.conditions, conditions);
    const record: OwnerRecord = {
      ...existing,
      conditions: merged.length ? merged : undefined,
      updated: Date.now(),
    };
    this.records.set(id, record);
    this.save();
    return record;
  }

  /** Merge records that share a label across categories (keeps preferences, most evidence). */
  consolidateDuplicateLabels(): number {
    const byLabel = new Map<string, OwnerRecord[]>();
    for (const record of this.list()) {
      const key = record.label.trim().toLowerCase();
      const group = byLabel.get(key) ?? [];
      group.push(record);
      byLabel.set(key, group);
    }

    let removed = 0;
    for (const group of byLabel.values()) {
      if (group.length <= 1) continue;

      const keeper = [...group].sort((a, b) => {
        if (a.category === "preferences" && b.category !== "preferences") return -1;
        if (b.category === "preferences" && a.category !== "preferences") return 1;
        const aEvidence = a.evidence?.length ?? 0;
        const bEvidence = b.evidence?.length ?? 0;
        if (bEvidence !== aEvidence) return bEvidence - aEvidence;
        return b.updated - a.updated;
      })[0]!;

      for (const dup of group) {
        if (dup.id === keeper.id) continue;
        for (const event of dup.evidence ?? []) {
          keeper.evidence = appendEvidence(
            keeper.evidence ?? [],
            event.kind,
            event.note,
            event.contextTags,
          );
        }
        this.records.delete(dup.id);
        removed++;
      }
      this.records.set(keeper.id, { ...keeper, updated: Date.now() });
    }

    if (removed > 0) this.save();
    return removed;
  }

  acceptProposal(id: string): OwnerRecord | null {
    const proposal = this.proposals.get(id);
    if (!proposal) return null;
    const existing = this.list().find(
      (r) => r.category === proposal.category && r.label === proposal.label,
    );
    let record: OwnerRecord;
    if (proposal.splitConditions?.length) {
      const existingRecord = this.list().find(
        (r) => r.category === proposal.category && r.label === proposal.label,
      );
      if (existingRecord) {
        record = this.upsert({
          id: existingRecord.id,
          category: proposal.category,
          label: proposal.label,
          value: proposal.value,
          guarded: proposal.guarded,
          evidenceNote: proposal.reason,
          contextTags: proposal.contextTags,
          tier: proposal.tier,
        });
        record = this.applyConditions(record.id, proposal.splitConditions) ?? record;
      } else {
        record = this.upsert({
          category: proposal.category,
          label: proposal.label,
          value: proposal.value,
          guarded: proposal.guarded,
          evidenceNote: proposal.reason,
          contextTags: proposal.contextTags,
          tier: proposal.tier,
        });
        record = this.applyConditions(record.id, proposal.splitConditions) ?? record;
      }
    } else if (existing && JSON.stringify(existing.value) === JSON.stringify(proposal.value)) {
      record =
        this.appendEvidence(
          existing.id,
          "confirmed",
          proposal.reason,
          proposal.contextTags,
        ) ?? existing;
    } else {
      record = this.upsert({
        category: proposal.category,
        label: proposal.label,
        value: proposal.value,
        guarded: proposal.guarded,
        evidenceNote: proposal.reason,
        contextTags: proposal.contextTags,
        tier: proposal.tier,
      });
    }
    this.proposals.delete(id);
    this.saveProposals();
    return record;
  }

  rejectProposal(id: string): void {
    const proposal = this.proposals.get(id);
    if (proposal) {
      this.recordEvidenceByKey(proposal.category, proposal.label, "dismissed", proposal.reason);
    }
    this.proposals.delete(id);
    this.saveProposals();
  }

  /** Append an evidence event to a record matched by category + label. */
  recordEvidenceByKey(
    category: string,
    label: string,
    kind: PreferenceEvidence["kind"],
    note?: string,
    contextTags?: string[],
  ): OwnerRecord | null {
    const keyCategory = category.trim().toLowerCase();
    const keyLabel = label.trim();
    const record = this.list().find((r) => r.category === keyCategory && r.label === keyLabel);
    if (!record) return null;
    return this.appendEvidence(record.id, kind, note, contextTags);
  }

  appendEvidence(
    id: string,
    kind: PreferenceEvidence["kind"],
    note?: string,
    contextTags?: string[],
  ): OwnerRecord | null {
    const existing = this.records.get(id);
    if (!existing) return null;
    const record: OwnerRecord = {
      ...existing,
      evidence: appendEvidence(existing.evidence ?? [], kind, note, contextTags),
      updated: Date.now(),
    };
    this.records.set(id, record);
    this.save();
    return record;
  }

  /** Apply curator reinforce/contradict/override signals from a completed pass. */
  applyCuratorSignals(signals: readonly CuratorSignal[]): number {
    let applied = 0;
    for (const signal of signals) {
      const kind = evidenceKindForSignal(signal.kind);
      if (
        this.recordEvidenceByKey(
          signal.category,
          signal.label,
          kind,
          signal.reason,
          signal.contextTags,
        )
      ) {
        applied++;
      }
    }
    return applied;
  }

  weightsFor(record: OwnerRecord) {
    const tier = record.tier ?? inferTier(record);
    return derivePreferenceWeights(record.evidence ?? [], tier);
  }

  /**
   * Accept every non-guarded proposal into the store. Guarded proposals stay
   * in the queue for explicit owner review in shell chrome / profile.
   */
  acceptOpenProposals(): number {
    let count = 0;
    for (const proposal of this.listProposals()) {
      if (proposal.guarded) continue;
      if (this.acceptProposal(proposal.id)) count++;
    }
    return count;
  }

  remove(id: string): void {
    this.records.delete(id);
    this.save();
  }

  wipe(): void {
    this.records.clear();
    this.proposals.clear();
    this.save();
    this.saveProposals();
  }

  list(): OwnerRecord[] {
    return [...this.records.values()].sort((a, b) =>
      a.category === b.category ? a.label.localeCompare(b.label) : a.category.localeCompare(b.category),
    );
  }

  listProposals(): RecordProposal[] {
    return [...this.proposals.values()].sort((a, b) => b.proposedAt - a.proposedAt);
  }

  categories(): string[] {
    return [...new Set(this.list().map((record) => record.category))];
  }

  /**
   * Assemble the disclosure slice for a session: open records inline,
   * guarded categories by name only.
   */
  contextSlice(sessionContextTags: readonly string[] = []): ProfileContext {
    const open: ProfileContext["open"] = [];
    const guarded = new Set<string>();
    for (const record of this.list()) {
      if (record.guarded) {
        guarded.add(record.category);
      } else {
        const weights = this.weightsFor(record);
        const tier = record.tier ?? inferTier(record);
        const conditions = record.conditions?.length ? record.conditions : undefined;
        const resolved = resolveRecordValue(record, sessionContextTags);
        open.push({
          category: record.category,
          label: record.label,
          value: resolved,
          defaultValue: conditions ? record.value : undefined,
          confidence: weights.confidence,
          strength: weights.strength,
          tier,
          contextTags: activeContextTags(record.evidence ?? []),
          conditions,
        });
      }
    }
    return {
      open,
      guardedCategories: [...guarded],
      summaryByCategory: buildProfileSummaryByCategory(open),
    };
  }

  /** Records disclosed after an approved data request, scoped to categories. */
  guardedRecords(categories: string[]): OwnerRecord[] {
    const wanted = new Set(categories.map((category) => category.trim().toLowerCase()));
    return this.list().filter((record) => record.guarded && wanted.has(record.category));
  }

  private save(): void {
    this.persist?.(this.list());
  }

  private saveProposals(): void {
    this.persistProposals?.(this.listProposals());
  }
}
