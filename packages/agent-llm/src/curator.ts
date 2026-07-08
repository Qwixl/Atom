import type { JsonValue } from "@qwixl/shell-core";

export type CuratorSignalKind = "reinforce" | "contradict" | "override";

export interface CuratorSignal {
  kind: CuratorSignalKind;
  category: string;
  label: string;
  reason?: string;
  contextTags?: string[];
}

/** Categories that default to guarded on curator capture (fail-safe). */
export const GUARD_BY_DEFAULT_CATEGORIES = new Set([
  "identity",
  "payment",
  "health",
  "credentials",
  "trusted-agents",
]);

export function defaultGuardForCategory(category: string): boolean {
  return GUARD_BY_DEFAULT_CATEGORIES.has(category.trim().toLowerCase());
}

/** Skip curator on turns that are informational lookups, not owner self-disclosure. */
export function shouldCurateTranscript(
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
): boolean {
  const userText = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.text.trim())
    .join("\n");
  if (!userText) return false;

  const looksLikeLookup =
    /^(what|who|when|where|why|how|can you|could you|search|find|look up|tell me about|what happened|latest|news about|headlines)/i.test(
      userText,
    ) || /\?\s*$/.test(userText);
  const ownerSelfDisclosure = /\b(i |my |me |i'm |i've |i'd |we |our |i prefer|i like|i want|i need|i am |i was )/i.test(
    userText,
  );

  if (looksLikeLookup && !ownerSelfDisclosure) return false;
  if (/^\[briefing-open\]/i.test(userText)) return false;
  return true;
}

function parseContextTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

export interface CuratorPassInput {
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
  existingRecords: Array<{
    category: string;
    label: string;
    value: JsonValue;
    tier?: "constraint" | "preference" | "taste";
    confidence?: number;
    strength?: number;
    contextTags?: string[];
    conditions?: Array<{ contextTags: string[]; value: JsonValue }>;
  }>;
}

export interface CuratorSplitProposal {
  category: string;
  label: string;
  defaultValue: JsonValue;
  conditions: Array<{ contextTags: string[]; value: JsonValue }>;
  reason?: string;
  tier?: "constraint" | "preference" | "taste";
  guarded?: boolean;
}

export interface CuratorPassResult {
  proposals: Array<{
    category: string;
    label: string;
    value: JsonValue;
    guarded: boolean;
    tier?: "constraint" | "preference" | "taste";
    reason?: string;
    contextTags?: string[];
  }>;
  signals: CuratorSignal[];
  splitProposals: CuratorSplitProposal[];
}

function parseTier(raw: unknown): "constraint" | "preference" | "taste" | undefined {
  if (raw === "constraint" || raw === "preference" || raw === "taste") return raw;
  return undefined;
}

export function buildCuratorPrompt(input: CuratorPassInput): string {
  const existing =
    input.existingRecords.length === 0
      ? "None."
      : input.existingRecords
          .map((r) => {
            const weights =
              r.confidence !== undefined && r.strength !== undefined
                ? ` (confidence ${r.confidence.toFixed(2)}, strength ${r.strength.toFixed(2)})`
                : "";
            const tier = r.tier ? ` tier=${r.tier}` : "";
            const tags =
              r.contextTags && r.contextTags.length > 0
                ? ` [context: ${r.contextTags.join(", ")}]`
                : "";
            const conditions =
              r.conditions && r.conditions.length > 0
                ? ` [conditional: ${JSON.stringify(r.conditions)}]`
                : "";
            return `- ${r.category}/${r.label}${tier}${weights}${tags}${conditions}: ${JSON.stringify(r.value)}`;
          })
          .join("\n");

  const turns = input.transcript
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`)
    .join("\n\n");

  return `You are a curator for an owner profile store. Extract durable facts the owner would want remembered, and update evidence on existing records when the transcript supports it.

Rules:
- Propose ONLY facts explicitly stated or clearly corrected by the **owner (USER lines)** in this transcript.
- Do NOT infer preferences the owner did not state.
- Skip ephemeral task details (one-off searches, temporary choices, news lookups, current-events Q&A).
- **Never** extract from ASSISTANT lines: web search results, headlines, public figures' actions, or retrieved news are NOT owner profile facts — even if the assistant stated them clearly.
- Informational questions (e.g. "what happened with X today", "news about Y") with no owner self-disclosure → return empty proposals.
- Do NOT store third-party politics, celebrities, or news subjects as owner constraints/preferences.
- Categories: use lowercase kebab-case. Put durable travel/dining habits in **preferences**, not travel-history (travel-history is for past trips taken).
- guarded: true for identity, payment, health, credentials, trusted-agents, or when uncertain (fail-safe).
- Do NOT propose aggregate JSON blobs — one atomic label per fact (e.g. "preferred-airline": "ANA", not a combined object).
- Before proposing, check existing records: if the same label already holds the same value, emit a **reinforce** signal instead of a new proposal.
- Do NOT duplicate a fact under a new label if an existing record already captures it (match by label across categories).
- contextTags: optional lowercase kebab-case tags for situational context visible in the transcript (e.g. traveling-with-family, budget-sensitive, short-haul, business-trip). Only tag when clearly supported.
- tier: classify each proposal as "constraint", "preference", or "taste":
  - constraint: safety-critical or non-negotiable (allergies, accessibility, religious dietary rules) — apply from first mention
  - preference: durable defaults (seat choice, airline, hotel tier) — may be rare-domain
  - taste: ephemeral situational (today's lunch, this trip's mood) — cheap to override, decays fast
- briefing-topics: when the owner states ongoing news/subject interests for daily roundups (e.g. "keep me posted on AI regulation"), propose { "category": "briefing-topics", "label": "topic", "value": "<short topic label>" } — not for one-off news lookups.
- Return JSON only:
{
  "proposals": [{ "category", "label", "value", "guarded", "tier", "reason", "contextTags"? }],
  "signals": [{ "kind": "reinforce"|"contradict"|"override", "category", "label", "reason", "contextTags"? }],
  "splitProposals": [{ "category", "label", "defaultValue", "conditions": [{ "contextTags": [...], "value": ... }], "reason", "tier"? }]
}
- signals reinforce existing records restated or acted on; contradict when the owner corrects a stored value; override when they chose differently from a prior default.
- splitProposals: when the SAME label needs DIFFERENT values under DIFFERENT context tags (e.g. premium economy normally, economy on short hops with kids), propose a conditional split instead of overwriting the default.
- Match signals and proposals to existing records by category + label.
- If nothing worth remembering or updating, return { "proposals": [], "signals": [], "splitProposals": [] }

Existing records:
${existing}

Transcript:
${turns}`;
}

export function parseCuratorResponse(raw: string): CuratorPassResult {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return { proposals: [], signals: [], splitProposals: [] };

  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
    proposals?: unknown[];
    signals?: unknown[];
    splitProposals?: unknown[];
  };

  const proposals: CuratorPassResult["proposals"] = [];
  if (Array.isArray(parsed.proposals)) {
    for (const item of parsed.proposals) {
      if (typeof item !== "object" || item === null) continue;
      const p = item as Record<string, unknown>;
      if (typeof p.category !== "string" || typeof p.label !== "string") continue;
      if (p.value === undefined) continue;

      const category = p.category.trim().toLowerCase();
      const guarded =
        typeof p.guarded === "boolean" ? p.guarded : defaultGuardForCategory(category);

      proposals.push({
        category,
        label: p.label.trim(),
        value: p.value as JsonValue,
        guarded,
        tier: parseTier(p.tier),
        reason: typeof p.reason === "string" ? p.reason.trim() : undefined,
        contextTags: parseContextTags(p.contextTags),
      });
    }
  }

  const signals: CuratorSignal[] = [];
  if (Array.isArray(parsed.signals)) {
    for (const item of parsed.signals) {
      if (typeof item !== "object" || item === null) continue;
      const s = item as Record<string, unknown>;
      if (typeof s.category !== "string" || typeof s.label !== "string") continue;
      if (s.kind !== "reinforce" && s.kind !== "contradict" && s.kind !== "override") continue;
      signals.push({
        kind: s.kind,
        category: s.category.trim().toLowerCase(),
        label: s.label.trim(),
        reason: typeof s.reason === "string" ? s.reason.trim() : undefined,
        contextTags: parseContextTags(s.contextTags),
      });
    }
  }

  const splitProposals: CuratorSplitProposal[] = [];
  if (Array.isArray(parsed.splitProposals)) {
    for (const item of parsed.splitProposals) {
      if (typeof item !== "object" || item === null) continue;
      const s = item as Record<string, unknown>;
      if (typeof s.category !== "string" || typeof s.label !== "string") continue;
      if (s.defaultValue === undefined) continue;
      if (!Array.isArray(s.conditions)) continue;
      const conditions: CuratorSplitProposal["conditions"] = [];
      for (const raw of s.conditions) {
        if (typeof raw !== "object" || raw === null) continue;
        const c = raw as Record<string, unknown>;
        if (!Array.isArray(c.contextTags) || c.value === undefined) continue;
        const contextTags = parseContextTags(c.contextTags);
        if (!contextTags?.length) continue;
        conditions.push({ contextTags, value: c.value as JsonValue });
      }
      if (conditions.length === 0) continue;
      const category = s.category.trim().toLowerCase();
      splitProposals.push({
        category,
        label: s.label.trim(),
        defaultValue: s.defaultValue as JsonValue,
        conditions,
        reason: typeof s.reason === "string" ? s.reason.trim() : undefined,
        tier: parseTier(s.tier),
        guarded:
          typeof s.guarded === "boolean" ? s.guarded : defaultGuardForCategory(category),
      });
    }
  }

  return { proposals, signals, splitProposals };
}
