/**
 * Model behavior admin (ops only — not product UI).
 *
 * First-use categorization (D085):
 *   - Evaluate unassessed bootstrap models ∪ pending first-use queue once.
 *   - Skip exact assessments that match the current eval baseline hash.
 *   - Do not re-score on a weekly timer.
 *
 *   pnpm --filter @qwixl/agent-llm admin:model-behavior
 *   pnpm --filter @qwixl/agent-llm admin:model-behavior -- --eval --write
 *
 * Keys: OPENROUTER_API_KEY | LLM_API_KEY | OPENAI_API_KEY (env only — never commit).
 * See repo-root MODEL-BEHAVIOR-ADMIN.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvalBaselineHash, PACKAGE_ROOT } from "./evalBaseline.js";
import {
  assignmentKind,
  isModelAssessed,
  MODEL_BEHAVIOR_REGISTRY,
  proposeClassFromFailureCounts,
  resolveModelBehavior,
  type ModelBehaviorAssignment,
  type ModelBehaviorClassId,
  type ModelBehaviorRegistry,
} from "../src/modelBehavior.js";
import { parseModelIdentity } from "../src/modelIdentity.js";
import {
  emptySightingsFile,
  mergeSightingsFiles,
  parseSightingsJson,
  type ModelSightingsFile,
} from "../src/modelSightings.js";
import { BOOTSTRAP_EVAL_MODELS } from "./bootstrapModels.js";
import { TOOL_EVAL_SCENARIOS } from "./scenarios.js";
import { formatEvalReport, type ScenarioScore } from "./scorer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, "../src/modelBehaviorRegistry.json");
const DEFAULT_SIGHTINGS_PATH = path.resolve(__dirname, "sightings.local.json");
/** Cap pending first-use models per run. */
const MAX_PENDING_MODELS = 12;

export interface EvalCandidate {
  modelId: string;
  source: "bootstrap" | "sighting" | "queue" | "override";
  queueId?: string;
}

function parseArgs(argv: string[]) {
  return {
    eval: argv.includes("--eval"),
    write: argv.includes("--write"),
    bootstrap: argv.includes("--bootstrap"),
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

export interface PendingQueueRow {
  id: string;
  modelId: string;
  mergeKey: string;
  reportCount?: number;
}

/** Fetch pending first-use rows from control plane (ops auth). */
export async function fetchPendingSightingsFromControlPlane(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PendingQueueRow[]> {
  const base = env.ATOM_CONTROL_PLANE_URL?.trim()?.replace(/\/$/, "");
  const secret = env.ATOM_PROVISION_SECRET?.trim();
  if (!base || !secret) return [];
  const res = await fetch(`${base}/ops/model-behavior/sightings/pending?limit=${MAX_PENDING_MODELS}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Warning: control-plane pending fetch failed (${res.status})`);
    return [];
  }
  const body = (await res.json()) as { pending?: PendingQueueRow[] };
  return Array.isArray(body.pending) ? body.pending : [];
}

export async function ackSightingsOnControlPlane(
  ids: string[],
  status: "processing" | "proposed" | "done" | "failed",
  env: NodeJS.ProcessEnv = process.env,
  error?: string,
): Promise<void> {
  const base = env.ATOM_CONTROL_PLANE_URL?.trim()?.replace(/\/$/, "");
  const secret = env.ATOM_PROVISION_SECRET?.trim();
  if (!base || !secret || ids.length === 0) return;
  const res = await fetch(`${base}/ops/model-behavior/sightings/ack`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ids,
      status,
      processedBy: "gha:model-behavior-admin",
      error,
    }),
  });
  if (!res.ok) {
    console.error(`Warning: control-plane ack failed (${res.status})`);
  }
}

/** List OpenRouter model ids (best-effort). */
export async function fetchOpenRouterModelCatalog(
  apiKey: string,
  baseUrl: string,
): Promise<Set<string> | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/models`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const set = new Set<string>();
    for (const row of body.data ?? []) {
      const id = row.id?.trim();
      if (id) set.add(id.toLowerCase());
    }
    return set.size ? set : null;
  } catch {
    return null;
  }
}

/**
 * Build eval candidates: EVAL_MODELS override, else unassessed bootstrap ∪ pending.
 * Family seeds never count as assessed.
 */
export function resolveEvalCandidates(input: {
  env?: NodeJS.ProcessEnv;
  registry?: ModelBehaviorRegistry;
  baselineHash: string;
  sightings?: ModelSightingsFile;
  pendingQueue?: PendingQueueRow[];
  includeBootstrap?: boolean;
}): { candidates: EvalCandidate[]; skippedAssessed: string[] } {
  const env = input.env ?? process.env;
  const registry = input.registry ?? MODEL_BEHAVIOR_REGISTRY;
  const sightings = input.sightings ?? emptySightingsFile();
  const pendingQueue = input.pendingQueue ?? [];
  const includeBootstrap = input.includeBootstrap ?? true;
  const skippedAssessed: string[] = [];
  const seen = new Set<string>();
  const candidates: EvalCandidate[] = [];

  const add = (modelId: string, source: EvalCandidate["source"], queueId?: string) => {
    const id = modelId.trim();
    if (!id) return;
    const key = parseModelIdentity(id).normalized || id.toLowerCase();
    if (seen.has(key)) return;
    if (isModelAssessed(id, input.baselineHash, registry)) {
      skippedAssessed.push(id);
      return;
    }
    seen.add(key);
    candidates.push({ modelId: id, source, queueId });
  };

  const override = env.EVAL_MODELS?.trim();
  if (override) {
    for (const m of override.split(",").map((s) => s.trim()).filter(Boolean)) {
      add(m, "override");
    }
    return { candidates, skippedAssessed };
  }

  if (includeBootstrap) {
    for (const m of BOOTSTRAP_EVAL_MODELS) add(m, "bootstrap");
  }

  for (const row of pendingQueue.slice(0, MAX_PENDING_MODELS)) {
    add(row.modelId, "queue", row.id);
  }

  for (const s of sightings.sightings.slice(0, MAX_PENDING_MODELS)) {
    add(s.modelId, s.queueId ? "queue" : "sighting", s.queueId);
  }

  return { candidates, skippedAssessed };
}

/** @deprecated Prefer resolveEvalCandidates — kept for sightings unit tests. */
export function resolveEvalModelShortlist(
  env: NodeJS.ProcessEnv = process.env,
  sightings: ModelSightingsFile = loadAdminSightings(env),
): { models: string[]; fromSightings: string[] } {
  const baselineHash = computeEvalBaselineHash(PACKAGE_ROOT);
  const { candidates } = resolveEvalCandidates({
    env,
    sightings,
    baselineHash,
    includeBootstrap: !env.EVAL_MODELS?.trim(),
  });
  return {
    models: candidates.map((c) => c.modelId),
    fromSightings: candidates.filter((c) => c.source === "sighting" || c.source === "queue").map((c) => c.modelId),
  };
}

function printRegistry(registry: ModelBehaviorRegistry, baselineHash?: string): void {
  console.log(
    `# Model behavior registry (schema ${registry.schemaVersion}, updated ${registry.updated})`,
  );
  console.log(`Default class: ${registry.defaultClassId}`);
  if (baselineHash) console.log(`Current eval baseline: ${baselineHash}`);
  console.log("\n## Classes");
  for (const [id, def] of Object.entries(registry.classes)) {
    console.log(
      `- **${id}**: toolChoice=${def.toolChoice}, alias=${def.includeDeprecatedAlias}, addendum=${def.promptAddendumId}`,
    );
    console.log(`  ${def.description}`);
  }
  console.log("\n## Exact assessments");
  const exact = registry.assignments.filter((a) => assignmentKind(a) === "exact");
  if (!exact.length) console.log("(none)");
  for (const a of exact) {
    const stale =
      baselineHash && a.evalBaseline && a.evalBaseline.hash !== baselineHash ? " STALE" : "";
    console.log(
      `- \`${a.pattern}\` → **${a.classId}**${a.note ? ` — ${a.note}` : ""}${stale}`,
    );
  }
  console.log("\n## Family seeds (fallback, not assessed)");
  for (const a of registry.assignments.filter((a) => assignmentKind(a) === "family")) {
    console.log(`- \`${a.pattern}\` → **${a.classId}**${a.note ? ` — ${a.note}` : ""}`);
  }
  console.log("\n## Sample resolution");
  for (const sample of [
    "openai/gpt-4o-mini",
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
      `- ${sample} → ${r.classId}${r.matchedPattern ? ` (${r.matchedKind} "${r.matchedPattern}")` : " (default)"}`,
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

function applyExactProposals(
  registry: ModelBehaviorRegistry,
  proposals: ModelBehaviorAssignment[],
): ModelBehaviorRegistry {
  const assignments = [...registry.assignments];
  for (const p of proposals) {
    const kind = assignmentKind(p);
    const patternKey = p.pattern.trim().toLowerCase();
    const idx = assignments.findIndex(
      (a) =>
        assignmentKind(a) === kind && a.pattern.trim().toLowerCase() === patternKey,
    );
    if (idx >= 0) assignments[idx] = p;
    else assignments.unshift(p);
  }
  // Exact first (stable), then family by pattern length desc.
  const exact = assignments.filter((a) => assignmentKind(a) === "exact");
  const family = assignments
    .filter((a) => assignmentKind(a) === "family")
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return {
    ...registry,
    updated: new Date().toISOString().slice(0, 10),
    schemaVersion: 2,
    defaultClassId: MODEL_BEHAVIOR_REGISTRY.defaultClassId,
    classes: MODEL_BEHAVIOR_REGISTRY.classes,
    assignments: [...exact, ...family],
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
    console.log(`Usage: admin:model-behavior [--eval] [--write] [--bootstrap] [--help]

  (default)     Print registry + sample resolutions (no API key)
  --eval        Run tool-judgment on unassessed candidates and propose exact classes
  --write       Write packages/agent-llm/src/modelBehaviorRegistry.json (no secrets)
  --bootstrap   Include bootstrap manifest even when queue-only mode is preferred

Env: OPENROUTER_API_KEY | LLM_API_KEY | OPENAI_API_KEY
     LLM_BASE_URL (default OpenRouter if OPENROUTER_API_KEY set)
     EVAL_MODELS (optional full override)
     MODEL_BEHAVIOR_SIGHTINGS (local sightings JSON path(s))
     ATOM_CONTROL_PLANE_URL + ATOM_PROVISION_SECRET (pending first-use queue)

See MODEL-BEHAVIOR-ADMIN.md.`);
    return;
  }

  const baselineHash = computeEvalBaselineHash(PACKAGE_ROOT);
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  let registry = JSON.parse(raw) as ModelBehaviorRegistry;
  printRegistry(registry, baselineHash);

  const sightings = loadAdminSightings();
  let pendingQueue: PendingQueueRow[] = [];
  try {
    pendingQueue = await fetchPendingSightingsFromControlPlane();
  } catch (error) {
    console.error(
      `Warning: pending queue fetch error: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (sightings.sightings.length || pendingQueue.length) {
    console.log(
      `\n## Pending first-use (${pendingQueue.length} queue, ${sightings.sightings.length} local sightings)`,
    );
    for (const row of pendingQueue.slice(0, 20)) {
      console.log(`- queue \`${row.modelId}\` id=${row.id}`);
    }
    for (const s of sightings.sightings.slice(0, 20)) {
      console.log(`- local \`${s.modelId}\` count=${s.count}`);
    }
  } else {
    console.log("\n## Pending first-use\n(none)");
  }

  let proposals: ModelBehaviorAssignment[] = [];
  let evaluatedQueueIds: string[] = [];
  const unavailable: string[] = [];

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

    // Include bootstrap when --bootstrap, or when no pending and no EVAL_MODELS.
    const includeBootstrap =
      args.bootstrap ||
      Boolean(process.env.EVAL_INCLUDE_BOOTSTRAP?.trim()) ||
      (!pendingQueue.length && !sightings.sightings.length && !process.env.EVAL_MODELS?.trim());

    const { candidates, skippedAssessed } = resolveEvalCandidates({
      env: process.env,
      registry,
      baselineHash,
      sightings,
      pendingQueue,
      includeBootstrap,
    });

    console.log(`\n## Eval candidates (${candidates.length})`);
    if (!candidates.length) {
      console.log("(none — all assessed or empty queue; exiting cleanly)");
      if (skippedAssessed.length) {
        console.log(`Skipped already assessed: ${skippedAssessed.join(", ")}`);
      }
      // Signal for CI
      if (process.env.GITHUB_OUTPUT) {
        writeFileSync(process.env.GITHUB_OUTPUT, "has_candidates=false\n", { flag: "a" });
      }
      return;
    }
    for (const c of candidates) {
      console.log(`- ${c.modelId} (${c.source}${c.queueId ? ` queue=${c.queueId}` : ""})`);
    }
    if (skippedAssessed.length) {
      console.log(`Skipped already assessed: ${skippedAssessed.join(", ")}`);
    }

    const catalog = await fetchOpenRouterModelCatalog(apiKey, baseUrl);
    const runnable: EvalCandidate[] = [];
    for (const c of candidates) {
      if (catalog && !catalog.has(c.modelId.toLowerCase())) {
        // Also try bare id match in catalog
        const bare = parseModelIdentity(c.modelId).normalized;
        const hit = [...catalog].some((id) => id === bare || id.endsWith(`/${bare}`));
        if (!hit) {
          unavailable.push(c.modelId);
          console.log(`- skip unavailable: ${c.modelId}`);
          continue;
        }
      }
      runnable.push(c);
    }

    evaluatedQueueIds = runnable
      .map((c) => c.queueId)
      .filter((id): id is string => Boolean(id));
    if (evaluatedQueueIds.length) {
      await ackSightingsOnControlPlane(evaluatedQueueIds, "processing");
    }

    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(
        process.env.GITHUB_OUTPUT,
        `has_candidates=true\nqueue_ids=${evaluatedQueueIds.join(",")}\n`,
        { flag: "a" },
      );
    }

    if (!runnable.length) {
      console.log("\nNo runnable models after catalog filter.");
      if (process.env.GITHUB_OUTPUT) {
        writeFileSync(process.env.GITHUB_OUTPUT, "has_candidates=false\n", { flag: "a" });
      }
      return;
    }

    const byModel = await evalModels(
      runnable.map((c) => c.modelId),
      apiKey,
      baseUrl,
    );
    console.log("\n## Proposed exact assessments\n");
    const scoredAt = new Date().toISOString().slice(0, 10);
    for (const [model, scores] of byModel) {
      const t = tallies(scores);
      const passCount = scores.filter((s) => s.pass).length;
      const classId = proposeClassFromFailureCounts({
        ...t,
        passCount,
        scenarioCount: scores.length,
      });
      const identity = parseModelIdentity(model);
      const pattern = identity.bare || model;
      const note = `exact ${scoredAt}: missing=${t.missingCall} unexpected=${t.unexpectedCall} settings=${t.settingsMissing} misRoute=${t.misRoute} pass=${passCount}/${scores.length}`;
      if (!classId) {
        console.log(
          `- ${model} (exact \`${pattern}\`) → skip (inconclusive / likely infra failure; ${note})`,
        );
        continue;
      }
      proposals.push({
        kind: "exact",
        pattern,
        classId,
        note,
        evalBaseline: {
          hash: baselineHash,
          scoredAt,
          modelId: model,
          baseUrl,
          tallies: t,
          passCount,
          scenarioCount: scores.length,
        },
      });
      console.log(`- ${model} (exact \`${pattern}\`) → **${classId}** (${note})`);
    }
    if (unavailable.length) {
      console.log(`\n## Unavailable (skipped)\n${unavailable.map((m) => `- ${m}`).join("\n")}`);
    }
  } else if (args.write) {
    proposals = registry.assignments.map((a) => ({ ...a }));
  }

  if (args.write) {
    registry = applyExactProposals(registry, proposals.length ? proposals : []);
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${REGISTRY_PATH} (secret-free)`);
    printRegistry(registry, baselineHash);
    if (evaluatedQueueIds.length) {
      await ackSightingsOnControlPlane(evaluatedQueueIds, "proposed");
    }
  } else if (proposals.length) {
    console.log("\nRe-run with --write to persist exact assessments into modelBehaviorRegistry.json");
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
