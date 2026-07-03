import type { EvidenceKind, PreferenceEvidence } from "./evidence.js";

/** Normalize legacy records restored without an evidence array. */
export function normalizeEvidence(raw: unknown): PreferenceEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: PreferenceEvidence[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Partial<PreferenceEvidence>;
    if (
      e.kind !== "stated" &&
      e.kind !== "confirmed" &&
      e.kind !== "acted-on" &&
      e.kind !== "overridden" &&
      e.kind !== "contradicted" &&
      e.kind !== "dismissed"
    ) {
      continue;
    }
    if (typeof e.at !== "number") continue;
    out.push({
      kind: e.kind,
      at: e.at,
      note: typeof e.note === "string" ? e.note : undefined,
      contextTags: Array.isArray(e.contextTags)
        ? e.contextTags.filter((t): t is string => typeof t === "string")
        : undefined,
    });
  }
  return out;
}

export function appendEvidence(
  existing: readonly PreferenceEvidence[],
  kind: EvidenceKind,
  note?: string,
  contextTags?: string[],
): PreferenceEvidence[] {
  const tags =
    contextTags?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? undefined;
  return [
    ...existing,
    {
      kind,
      at: Date.now(),
      note: note?.trim() || undefined,
      contextTags: tags?.length ? tags : undefined,
    },
  ];
}

/** Tags from the most recent evidence events (for model context). */
export function activeContextTags(
  evidence: readonly PreferenceEvidence[],
  eventLimit = 5,
): string[] {
  const tags = new Set<string>();
  for (const event of [...evidence].reverse().slice(0, eventLimit)) {
    for (const tag of event.contextTags ?? []) tags.add(tag);
  }
  return [...tags];
}
