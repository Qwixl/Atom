/**
 * Model behavior admin (ops only — not product UI).
 *
 *   pnpm --filter @qwixl/agent-llm admin:model-behavior
 *   pnpm --filter @qwixl/agent-llm admin:model-behavior -- --eval --write
 *
 * Keys: OPENROUTER_API_KEY | LLM_API_KEY | OPENAI_API_KEY (env only — never commit).
 * See repo-root MODEL-BEHAVIOR-ADMIN.md.
 *
 * MBA-7 sightings: merges model ids from evals/sightings.local.json and
 * MODEL_BEHAVIOR_SIGHTINGS (path) into the --eval shortlist.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODEL_BEHAVIOR_REGISTRY,
  proposeClassFromFailureCounts,
  resolveModelBehavior,
  type ModelBehaviorClassId,
  type ModelBehaviorRegistry,
} from "../src/modelBehavior.js";
import {
  emptySightingsFile,
  mergeSightingsFiles,
  parseSightingsJson,
  sightingsModelIds,
  type ModelSightingsFile,
} from "../src/modelSightings.js";
import { TOOL_EVAL_SCENARIOS } from "./scenarios.js";
import { formatEvalReport, type ScenarioScore } from "./scorer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, "../src/modelBehaviorRegistry.json");
const DEFAULT_SIGHTINGS_PATH = path.resolve(__dirname, "sightings.local.json");
const DEFAULT_EVAL_MODELS = ["gpt-4o-mini", "gpt-4o"];
/** Cap auto-merged sightings so weekly jobs stay bounded. */
const MAX_SIGHTING_MODELS = 12;

function parseArgs(argv: string[]) {
  return {
    eval: argv.includes("--eval"),
    write: argv.includes("--write"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function loadSightingsFile(filePath: string): ModelSightingsFile {
  if (!existsSync(filePath)) return emptySightingsFile();
  try {
    return parseSightingsJson(readFileSync(filePath, "utf8"));
  } catch {
    console.error(`Warning: could not parse sightings at ${filePath}`);
    return emptySightingsFile();
  }
}

/** Collect sightings from local eval file + MODEL_BEHAVIOR_SIGHTINGS path(s). */
export function loadAdminSightings(
  env: NodeJS.ProcessEnv = process.env,
): ModelSightingsFile {
  const files: ModelSightingsFile[] = [loadSightingsFile(DEFAULT_SIGHTINGS_PATH)];
  const extra = env.MODEL_BEHAVIOR_SIGHTINGS?.trim();
  if (extra) {
    for (const part of extra.split(path.delimiter)) {
      const p = part.trim();
      if (p) files.push(loadSightingsFile(path.resolve(p)));
    }
  }
  return mergeSightingsFiles(...files);
}

/**
 * EVAL_MODELS overrides entirely when set.
 * Otherwise: defaults ∪ top sightings (by count), capped.
 */
export function resolveEvalModelShortlist(
  env: NodeJS.ProcessEnv = process.env,
  sightings: ModelSightingsFile = loadAdminSightings(env),
): { models: string[]; fromSightings: string[] } {
  const override = env.EVAL_MODELS?.trim();
  if (override) {
    const models = override
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    return { models, fromSightings: [] };
  }
  const seen = new Set<string>();
  const models: string[] = [];
  const fromSightings: string[] = [];
  const add = (id: string, tag?: "sighting") => {
    const key = id.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    models.push(id.trim());
    if (tag === "sighting") fromSightings.push(id.trim());
  };
  for (const m of DEFAULT_EVAL_MODELS) add(m);
  for (const id of sightingsModelIds(sightings).slice(0, MAX_SIGHTING_MODELS)) {
    add(id, "sighting");
  }
  return { models, fromSightings };
}

function printRegistry(registry: ModelBehaviorRegistry): void {
  console.log(
    `# Model behavior registry (schema ${registry.schemaVersion}, updated ${registry.updated})`,
  );
  console.log(`Default class: ${registry.defaultClassId}\n`);
  console.log("## Classes");
  for (const [id, def] of Object.entries(registry.classes)) {
    console.log(
      `- **${id}**: toolChoice=${def.toolChoice}, alias=${def.includeDeprecatedAlias}, addendum=${def.promptAddendumId}`,
    );
    console.log(`  ${def.description}`);
  }
  console.log("\n## Assignments (first pattern match wins)");
  for (const a of registry.assignments) {
    console.log(`- \`${a.pattern}\` → **${a.classId}**${a.note ? ` — ${a.note}` : ""}`);
  }
  console.log("\n## Sample resolution");
  for (const sample of [
    "gpt-4o-mini",
    "gpt-4o",
    "claude-sonnet-4",
    "llama-3.1-8b",
    "deepseek-chat",
    "gemini-2.0-flash",
    "grok-3",
    "unknown-model",
  ]) {
    const r = resolveModelBehavior(sample, registry);
    console.log(
      `- ${sample} → ${r.classId}${r.matchedPattern ? ` (matched "${r.matchedPattern}")` : " (default)"}`,
    );
  }
}

function tallies(scores: ScenarioScore[]): {
  missingCall: number;
  unexpectedCall: number;
  settingsMissing: number;
  misRoute: number;
  toolScenarioCount: number;
} {
  const toolScenarioCount = TOOL_EVAL_SCENARIOS.filter((s) => s.expectAnyTool?.length).length;
  let missingCall = 0;
  let unexpectedCall = 0;
  let settingsMissing = 0;
  let misRoute = 0;
  for (const s of scores) {
    if (s.failureClass === "missing-call") missingCall += 1;
    if (s.failureClass === "unexpected-call") unexpectedCall += 1;
    if (s.failureClass === "settings-missing") settingsMissing += 1;
    if (s.failureClass === "mis-route") misRoute += 1;
  }
  return { missingCall, unexpectedCall, settingsMissing, misRoute, toolScenarioCount };
}

function patternForModel(model: string): string {
  // Prefer bare id without provider prefix for OpenRouter-style ids.
  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return bare.trim();
}

function applyProposals(
  registry: ModelBehaviorRegistry,
  proposals: Array<{ pattern: string; classId: ModelBehaviorClassId; note: string }>,
): ModelBehaviorRegistry {
  const assignments = [...registry.assignments];
  for (const p of proposals) {
    const idx = assignments.findIndex((a) => a.pattern.toLowerCase() === p.pattern.toLowerCase());
    const next = { pattern: p.pattern, classId: p.classId, note: p.note };
    if (idx >= 0) assignments[idx] = next;
    else assignments.unshift(next);
  }
  // Longer / more specific patterns should be listed before shorter prefixes
  // (e.g. gpt-4o-mini before gpt-4o). Sort by pattern length descending.
  assignments.sort((a, b) => b.pattern.length - a.pattern.length);
  return {
    ...registry,
    updated: new Date().toISOString().slice(0, 10),
    schemaVersion: 1,
    defaultClassId: MODEL_BEHAVIOR_REGISTRY.defaultClassId,
    classes: MODEL_BEHAVIOR_REGISTRY.classes,
    assignments,
  };
}

async function evalModels(
  models: string[],
  apiKey: string,
  baseUrl: string,
): Promise<Map<string, ScenarioScore[]>> {
  const { runScenario } = await import("./runToolsEval.js");
  const byModel = new Map<string, ScenarioScore[]>();
  for (const model of models) {
    console.error(`Evaluating ${model} (${TOOL_EVAL_SCENARIOS.length} scenarios)…`);
    const scores: ScenarioScore[] = [];
    for (const scenario of TOOL_EVAL_SCENARIOS) {
      process.stderr.write(`  ${scenario.id}… `);
      try {
        const score = await runScenario(model, apiKey, baseUrl, scenario);
        scores.push(score);
        console.error(score.pass ? "pass" : `FAIL (${score.failureClass})`);
      } catch (error) {
        scores.push({
          id: scenario.id,
          pass: false,
          failureClass: "protocol-violation",
          detail: error instanceof Error ? error.message : String(error),
          tools: [],
        });
        console.error("ERROR");
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(formatEvalReport(model, scores));
    byModel.set(model, scores);
  }
  return byModel;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: admin:model-behavior [--eval] [--write] [--help]

  (default)  Print registry + sample resolutions (no API key)
  --eval     Run tool-judgment eval and propose class moves
  --write    Write packages/agent-llm/src/modelBehaviorRegistry.json (no secrets)

Env: OPENROUTER_API_KEY | LLM_API_KEY | OPENAI_API_KEY
     LLM_BASE_URL (default OpenRouter if OPENROUTER_API_KEY set, else OpenAI)
     EVAL_MODELS (optional override; else defaults ∪ sightings)
     MODEL_BEHAVIOR_SIGHTINGS (path or PATH-delimited list of sightings JSON)

Sightings (MBA-7): evals/sightings.local.json (gitignored via *.local.*)
  Shell: localStorage key atom.modelBehavior.sightings.v1 — export JSON into sightings.local.json
  Hosted: $ATOM_DATA_DIR/model-behavior-sightings.json — point MODEL_BEHAVIOR_SIGHTINGS at it

See MODEL-BEHAVIOR-ADMIN.md.`);
    return;
  }

  const raw = readFileSync(REGISTRY_PATH, "utf8");
  let registry = JSON.parse(raw) as ModelBehaviorRegistry;
  printRegistry(registry);

  const sightings = loadAdminSightings();
  if (sightings.sightings.length) {
    console.log(`\n## Sightings (${sightings.sightings.length} model ids)`);
    for (const s of sightings.sightings.slice(0, 20)) {
      console.log(`- \`${s.modelId}\` count=${s.count}${s.source ? ` (${s.source})` : ""}`);
    }
  } else {
    console.log(
      "\n## Sightings\n(none — add evals/sightings.local.json or set MODEL_BEHAVIOR_SIGHTINGS)",
    );
  }

  let proposals: Array<{ pattern: string; classId: ModelBehaviorClassId; note: string }> = [];

  if (args.eval) {
    const apiKey =
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "Set OPENROUTER_API_KEY (or LLM_API_KEY / OPENAI_API_KEY) for --eval. Never commit keys.",
      );
    }
    const baseUrl =
      process.env.LLM_BASE_URL?.trim() ||
      (process.env.OPENROUTER_API_KEY?.trim()
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1");
    const { models, fromSightings } = resolveEvalModelShortlist(process.env, sightings);
    console.log(`\n## Eval shortlist (${models.length})`);
    console.log(models.map((m) => `- ${m}`).join("\n"));
    if (fromSightings.length) {
      console.log(`(from sightings: ${fromSightings.join(", ")})`);
    }
    const byModel = await evalModels(models, apiKey, baseUrl);
    console.log("\n## Proposed class moves\n");
    for (const [model, scores] of byModel) {
      const t = tallies(scores);
      const classId = proposeClassFromFailureCounts(t);
      const pattern = patternForModel(model);
      const note = `auto ${new Date().toISOString().slice(0, 10)}: missing=${t.missingCall} unexpected=${t.unexpectedCall} settings=${t.settingsMissing} misRoute=${t.misRoute}`;
      proposals.push({ pattern, classId, note });
      console.log(`- ${model} (pattern \`${pattern}\`) → **${classId}** (${note})`);
    }
  } else if (args.write) {
    // Refresh class defs + date without live eval
    proposals = registry.assignments.map((a) => ({
      pattern: a.pattern,
      classId: a.classId,
      note: a.note ?? "refreshed class definitions",
    }));
  }

  if (args.write) {
    registry = applyProposals(registry, proposals.length ? proposals : []);
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${REGISTRY_PATH} (secret-free)`);
    printRegistry(registry);
  } else if (proposals.length) {
    console.log("\nRe-run with --write to persist proposals into modelBehaviorRegistry.json");
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
