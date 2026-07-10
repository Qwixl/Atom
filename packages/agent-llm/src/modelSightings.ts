/**
 * Model-id sightings for behavior-admin discovery (MBA-7).
 * Stores model ids only — never API keys or base URLs with credentials.
 */
import { normalizeBehaviorModelId } from "./modelBehavior.js";

export const MODEL_SIGHTINGS_SCHEMA_VERSION = 1;
/** Browser localStorage key (shell). */
export const MODEL_SIGHTINGS_STORAGE_KEY = "atom.modelBehavior.sightings.v1";

export type ModelSightingSource = "shell" | "hosted" | "admin" | "import";

export interface ModelSighting {
  /** Raw model id as configured (may include provider prefix). */
  modelId: string;
  /** ISO timestamp of last sighting. */
  seenAt: string;
  /** How many times recorded (best-effort). */
  count: number;
  source?: ModelSightingSource;
}

export interface ModelSightingsFile {
  schemaVersion: number;
  updated: string;
  sightings: ModelSighting[];
}

/** Merge key: bare model id (strip provider prefix so openai/gpt-4o ≡ gpt-4o). */
export function sightingMergeKey(modelId: string): string {
  const n = normalizeBehaviorModelId(modelId);
  const slash = n.lastIndexOf("/");
  return slash >= 0 ? n.slice(slash + 1) : n;
}

function preferModelId(a: string, b: string): string {
  // Prefer provider-prefixed ids for OpenRouter-style EVAL_MODELS.
  if (a.includes("/") && !b.includes("/")) return a;
  if (b.includes("/") && !a.includes("/")) return b;
  return a.length >= b.length ? a : b;
}

export function emptySightingsFile(): ModelSightingsFile {
  return {
    schemaVersion: MODEL_SIGHTINGS_SCHEMA_VERSION,
    updated: new Date().toISOString(),
    sightings: [],
  };
}

export function parseSightingsJson(raw: string): ModelSightingsFile {
  const parsed = JSON.parse(raw) as Partial<ModelSightingsFile>;
  const sightings = Array.isArray(parsed.sightings) ? parsed.sightings : [];
  return {
    schemaVersion: MODEL_SIGHTINGS_SCHEMA_VERSION,
    updated: typeof parsed.updated === "string" ? parsed.updated : new Date().toISOString(),
    sightings: sightings
      .map((s) => normalizeSighting(s))
      .filter((s): s is ModelSighting => Boolean(s)),
  };
}

function normalizeSighting(raw: unknown): ModelSighting | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const modelId = String(row.modelId ?? "").trim();
  if (!modelId || modelId.length > 200) return null;
  // Reject anything that looks like a secret slipped into the id field.
  if (/sk-[a-zA-Z0-9]|api[_-]?key|bearer\s/i.test(modelId)) return null;
  const count = typeof row.count === "number" && Number.isFinite(row.count) ? Math.max(1, row.count) : 1;
  const seenAt =
    typeof row.seenAt === "string" && row.seenAt.trim() ? row.seenAt : new Date().toISOString();
  const source = row.source as ModelSightingSource | undefined;
  return { modelId, seenAt, count, source };
}

export function mergeSighting(
  file: ModelSightingsFile,
  modelId: string,
  source: ModelSightingSource = "shell",
  at: string = new Date().toISOString(),
): ModelSightingsFile {
  const id = modelId.trim();
  if (!id) return file;
  if (/sk-[a-zA-Z0-9]|api[_-]?key|bearer\s/i.test(id)) return file;

  const key = sightingMergeKey(id);
  if (!key) return file;
  const sightings = [...file.sightings];
  const idx = sightings.findIndex((s) => sightingMergeKey(s.modelId) === key);
  if (idx >= 0) {
    const prev = sightings[idx]!;
    sightings[idx] = {
      modelId: preferModelId(prev.modelId, id),
      seenAt: at,
      count: prev.count + 1,
      source: source ?? prev.source,
    };
  } else {
    sightings.push({ modelId: id, seenAt: at, count: 1, source });
  }
  sightings.sort((a, b) => b.count - a.count || a.modelId.localeCompare(b.modelId));
  return {
    schemaVersion: MODEL_SIGHTINGS_SCHEMA_VERSION,
    updated: at,
    sightings,
  };
}

export function mergeSightingsFiles(...files: ModelSightingsFile[]): ModelSightingsFile {
  const byKey = new Map<string, ModelSighting>();
  for (const file of files) {
    for (const s of file.sightings) {
      const key = sightingMergeKey(s.modelId);
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...s, count: Math.max(1, s.count) });
      } else {
        byKey.set(key, {
          modelId: preferModelId(prev.modelId, s.modelId),
          seenAt: prev.seenAt >= s.seenAt ? prev.seenAt : s.seenAt,
          count: prev.count + Math.max(1, s.count),
          source: s.source ?? prev.source,
        });
      }
    }
  }
  return {
    schemaVersion: MODEL_SIGHTINGS_SCHEMA_VERSION,
    updated: new Date().toISOString(),
    sightings: [...byKey.values()].sort(
      (a, b) => b.count - a.count || a.modelId.localeCompare(b.modelId),
    ),
  };
}

export function sightingsModelIds(file: ModelSightingsFile): string[] {
  return file.sightings.map((s) => s.modelId);
}

export function serializeSightings(file: ModelSightingsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Browser: load from localStorage (returns empty file if missing/invalid). */
export function loadSightingsFromLocalStorage(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): ModelSightingsFile {
  if (!storage) return emptySightingsFile();
  try {
    const raw = storage.getItem(MODEL_SIGHTINGS_STORAGE_KEY);
    if (!raw) return emptySightingsFile();
    return parseSightingsJson(raw);
  } catch {
    return emptySightingsFile();
  }
}

/** Browser: persist sightings (model ids only). */
export function saveSightingsToLocalStorage(
  file: ModelSightingsFile,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): void {
  if (!storage) return;
  storage.setItem(MODEL_SIGHTINGS_STORAGE_KEY, serializeSightings(file));
}

/** Record one sighting in localStorage (shell Chat). */
export function recordShellModelSighting(modelId: string): ModelSightingsFile {
  const next = mergeSighting(loadSightingsFromLocalStorage(), modelId, "shell");
  saveSightingsToLocalStorage(next);
  return next;
}
