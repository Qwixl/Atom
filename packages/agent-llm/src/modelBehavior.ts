/**
 * Model behavior classes (Q36 / MBA) — ops-maintained, secret-free.
 * Registry JSON is updated by `admin:model-behavior`; runtime only reads knobs.
 *
 * Schema v2: exact assessed assignments vs family fallback seeds.
 * Exact assessments are one-time for a model id + eval baseline hash.
 */
import registryJson from "./modelBehaviorRegistry.json" with { type: "json" };
import { parseModelIdentity } from "./modelIdentity.js";

export type ModelBehaviorClassId =
  | "tool-eager"
  | "balanced"
  | "tool-shy"
  | "local-slm";

export type ModelToolChoice = "auto" | "required";

export type PromptAddendumId = "none" | "tool-eager" | "tool-shy" | "local-slm";

export type ModelBehaviorAssignmentKind = "exact" | "family";

export interface ModelBehaviorClassDef {
  description: string;
  toolChoice: ModelToolChoice;
  includeDeprecatedAlias: boolean;
  promptAddendumId: PromptAddendumId;
}

export interface ModelBehaviorEvalTallies {
  missingCall: number;
  unexpectedCall: number;
  settingsMissing: number;
  misRoute: number;
  toolScenarioCount: number;
}

export interface ModelBehaviorEvalBaseline {
  hash: string;
  scoredAt: string;
  modelId: string;
  baseUrl?: string;
  tallies?: ModelBehaviorEvalTallies;
  passCount?: number;
  scenarioCount?: number;
}

export interface ModelBehaviorAssignment {
  /**
   * exact — assessed for a specific bare model id (one-time).
   * family — substring fallback seed (not an assessment).
   * Omitted kind is treated as family for v1 JSON compatibility.
   */
  kind?: ModelBehaviorAssignmentKind;
  /** Exact: bare model id. Family: case-insensitive substring. */
  pattern: string;
  classId: ModelBehaviorClassId;
  note?: string;
  /** Present only on exact assessments. */
  evalBaseline?: ModelBehaviorEvalBaseline;
}

export interface ModelBehaviorRegistry {
  schemaVersion: number;
  updated: string;
  defaultClassId: ModelBehaviorClassId;
  classes: Record<ModelBehaviorClassId, ModelBehaviorClassDef>;
  assignments: ModelBehaviorAssignment[];
}

export interface ResolvedModelBehavior {
  classId: ModelBehaviorClassId;
  toolChoice: ModelToolChoice;
  includeDeprecatedAlias: boolean;
  promptAddendumId: PromptAddendumId;
  /** Injected into the system prompt when non-empty. */
  promptAddendum: string;
  matchedPattern?: string;
  matchedKind?: ModelBehaviorAssignmentKind;
  evalBaseline?: ModelBehaviorEvalBaseline;
}

const PROMPT_ADDENDA: Record<PromptAddendumId, string> = {
  none: "",
  "tool-eager":
    "## Model behavior note\nYou tend to call tools readily. Still skip tools for pure greetings/thanks, and do not invent connector results. Soft-confirm track/alert/daily-update turns MUST include settingsProposal in the same JSON messages array — text alone is a protocol failure.",
  "tool-shy":
    "## Model behavior note (tool-shy profile)\nWhen the owner asks for schedule, feeds, tasks, GitHub/Notion/Linear, contacts, weather, or a https URL, you MUST call the matching intent-named tool before answering. Do not answer those asks from snapshots or training knowledge alone. Soft-confirm track/alert turns MUST include settingsProposal in the same JSON messages array.",
  "local-slm":
    "## Model behavior note (local SLM)\nRespond with a single JSON object only. Prefer intent-named tools listed under Tools. Keep compositions small. If unsure which tool, call the closest listed tool rather than inventing data. Soft-confirm track/alert turns MUST include settingsProposal in the same JSON messages array.",
};

export const MODEL_BEHAVIOR_REGISTRY: ModelBehaviorRegistry =
  registryJson as ModelBehaviorRegistry;

export function normalizeBehaviorModelId(model: string): string {
  return parseModelIdentity(model).normalized || parseModelIdentity(model).raw.toLowerCase();
}

export function assignmentKind(a: ModelBehaviorAssignment): ModelBehaviorAssignmentKind {
  return a.kind === "exact" ? "exact" : "family";
}

export function listBehaviorClassIds(): ModelBehaviorClassId[] {
  return Object.keys(MODEL_BEHAVIOR_REGISTRY.classes) as ModelBehaviorClassId[];
}

function resolveFromDef(
  registry: ModelBehaviorRegistry,
  classId: ModelBehaviorClassId,
  matched?: ModelBehaviorAssignment,
): ResolvedModelBehavior {
  const def = registry.classes[classId] ?? registry.classes[registry.defaultClassId];
  const promptAddendumId = def.promptAddendumId;
  return {
    classId,
    toolChoice: def.toolChoice,
    includeDeprecatedAlias: def.includeDeprecatedAlias,
    promptAddendumId,
    promptAddendum: PROMPT_ADDENDA[promptAddendumId] ?? "",
    matchedPattern: matched?.pattern,
    matchedKind: matched ? assignmentKind(matched) : undefined,
    evalBaseline: matched?.evalBaseline,
  };
}

export function resolveBehaviorClass(
  classId: ModelBehaviorClassId,
  registry: ModelBehaviorRegistry = MODEL_BEHAVIOR_REGISTRY,
): ResolvedModelBehavior {
  return resolveFromDef(registry, classId);
}

export function resolveModelBehavior(
  model: string,
  registry: ModelBehaviorRegistry = MODEL_BEHAVIOR_REGISTRY,
): ResolvedModelBehavior {
  const identity = parseModelIdentity(model);
  const id = identity.normalized || identity.raw.toLowerCase();

  // 1) Exact bare-id match (assessed models).
  for (const assignment of registry.assignments) {
    if (assignmentKind(assignment) !== "exact") continue;
    const pattern = assignment.pattern.trim().toLowerCase();
    if (!pattern) continue;
    if (id === pattern || identity.raw.toLowerCase() === pattern) {
      return resolveFromDef(registry, assignment.classId, assignment);
    }
  }

  // 2) Longest family substring pattern.
  let matched: ModelBehaviorAssignment | undefined;
  const family = registry.assignments
    .filter((a) => assignmentKind(a) === "family")
    .sort((a, b) => b.pattern.trim().length - a.pattern.trim().length);
  for (const assignment of family) {
    const pattern = assignment.pattern.trim().toLowerCase();
    if (!pattern) continue;
    if (id.includes(pattern) || identity.raw.toLowerCase().includes(pattern)) {
      matched = assignment;
      break;
    }
  }

  const classId = matched?.classId ?? registry.defaultClassId;
  return resolveFromDef(registry, classId, matched);
}

/**
 * True when an exact assessment exists for this model.
 * When currentBaselineHash is provided, also requires matching evalBaseline.hash
 * (admin shortlist). When omitted, any exact assessment counts (hosted queue skip).
 */
export function isModelAssessed(
  model: string,
  currentBaselineHash?: string,
  registry: ModelBehaviorRegistry = MODEL_BEHAVIOR_REGISTRY,
): boolean {
  const resolved = resolveModelBehavior(model, registry);
  if (resolved.matchedKind !== "exact") return false;
  if (!currentBaselineHash) return true;
  if (!resolved.evalBaseline) return false;
  return resolved.evalBaseline.hash === currentBaselineHash;
}

/**
 * Propose a class from eval failure tallies (missing-call dominant → tool-shy, etc.).
 * Used by the maintenance script — not by Chat UI.
 * Returns null when scores are inconclusive so --write does not invent a class.
 * For first-use categorization, callers may map null → balanced (clean scoreboard).
 */
export function proposeClassFromFailureCounts(counts: {
  missingCall: number;
  unexpectedCall: number;
  settingsMissing: number;
  misRoute: number;
  toolScenarioCount: number;
}): ModelBehaviorClassId | null {
  const n = Math.max(1, counts.toolScenarioCount);
  const missingRate = counts.missingCall / n;
  const unexpectedRate = counts.unexpectedCall / n;
  if (missingRate >= 0.4) return "tool-shy";
  if (unexpectedRate >= 0.25) return "tool-eager";
  if (counts.settingsMissing >= 2 && missingRate < 0.25) return "balanced";
  // Clean or near-clean scoreboard → balanced (first-use needs a class).
  if (
    counts.missingCall === 0 &&
    counts.unexpectedCall === 0 &&
    counts.misRoute === 0 &&
    counts.settingsMissing <= 1
  ) {
    return "balanced";
  }
  return null;
}
