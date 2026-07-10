/**
 * Model behavior classes (Q36 / MBA) — ops-maintained, secret-free.
 * Registry JSON is updated by `admin:model-behavior`; runtime only reads knobs.
 */
import registryJson from "./modelBehaviorRegistry.json" with { type: "json" };

export type ModelBehaviorClassId =
  | "tool-eager"
  | "balanced"
  | "tool-shy"
  | "local-slm";

export type ModelToolChoice = "auto" | "required";

export type PromptAddendumId = "none" | "tool-eager" | "tool-shy" | "local-slm";

export interface ModelBehaviorClassDef {
  description: string;
  toolChoice: ModelToolChoice;
  includeDeprecatedAlias: boolean;
  promptAddendumId: PromptAddendumId;
}

export interface ModelBehaviorAssignment {
  /** Case-insensitive substring match against normalized model id (first hit wins). */
  pattern: string;
  classId: ModelBehaviorClassId;
  note?: string;
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
  return model.trim().replace(/^models\//, "").toLowerCase();
}

export function listBehaviorClassIds(): ModelBehaviorClassId[] {
  return Object.keys(MODEL_BEHAVIOR_REGISTRY.classes) as ModelBehaviorClassId[];
}

export function resolveModelBehavior(
  model: string,
  registry: ModelBehaviorRegistry = MODEL_BEHAVIOR_REGISTRY,
): ResolvedModelBehavior {
  const id = normalizeBehaviorModelId(model);
  let matched: ModelBehaviorAssignment | undefined;
  const ordered = [...registry.assignments].sort(
    (a, b) => b.pattern.trim().length - a.pattern.trim().length,
  );
  for (const assignment of ordered) {
    const pattern = assignment.pattern.trim().toLowerCase();
    if (!pattern) continue;
    if (id.includes(pattern)) {
      matched = assignment;
      break;
    }
  }
  const classId = matched?.classId ?? registry.defaultClassId;
  const def = registry.classes[classId] ?? registry.classes[registry.defaultClassId];
  const promptAddendumId = def.promptAddendumId;
  return {
    classId,
    toolChoice: def.toolChoice,
    includeDeprecatedAlias: def.includeDeprecatedAlias,
    promptAddendumId,
    promptAddendum: PROMPT_ADDENDA[promptAddendumId] ?? "",
    matchedPattern: matched?.pattern,
  };
}

/**
 * Propose a class from eval failure tallies (missing-call dominant → tool-shy, etc.).
 * Used by the maintenance script — not by Chat UI.
 * Returns null when scores are inconclusive so --write does not clobber seeds.
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
  return null;
}
