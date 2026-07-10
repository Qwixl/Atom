# Model behavior administration

**Internal ops / maintenance — not a product Settings feature.**

Atom’s Chat tool loop behaves differently across models (some under-invoke connectors; some over-call). Maintainers assign **behavior classes** so the runtime applies allowlisted knobs (`tool_choice`, prompt addendum, whether the deprecated `atom_connector_invoke` alias is exposed). Assignments live in a **secret-free** registry committed with the code.

**Policy (first-use categorization):** assess each **exact** model id once under the current eval baseline. Do not re-score the same model every week. Family seeds are fallbacks only — they are not assessments. Re-score only when the eval baseline hash changes (explicit maintenance) or an alias/version needs a new exact assessment.

Anyone forking or running locally gets this machinery. **API keys never ship in the repo** — use env vars / CI secrets only.

## Behavior classes

| Class | When to use | Runtime knobs (v1) |
|---|---|---|
| `tool-eager` | Models that call tools readily (may over-call) | `tool_choice: auto`, deprecated alias **on**, light “don’t over-call” addendum |
| `balanced` | Default / unknown models | `tool_choice: auto`, alias on, no extra addendum |
| `tool-shy` | Models that answer from context instead of invoking | `tool_choice: auto`, alias on, **strong invoke** system addendum |
| `local-slm` | Small / local models with weaker tool+JSON discipline | `tool_choice: auto`, alias **off** (fewer tools), local-slm protocol addendum |

Source of truth: [`packages/agent-llm/src/modelBehaviorRegistry.json`](./packages/agent-llm/src/modelBehaviorRegistry.json)  
Resolver: `@qwixl/agent-llm` → `resolveModelBehavior(modelId)` (exact bare id → longest family pattern → `balanced`).

### Exact vs family

| Kind | Meaning |
|---|---|
| `exact` | One-time assessment for a bare model id + `evalBaseline.hash` |
| `family` | Substring fallback seed (e.g. `claude`, `llama`) — not an assessment |

**Classes are remediation, not “best prompt” tuning.** Models that pass the suite land on `balanced` (no special addendum). `tool-shy` / `tool-eager` / `local-slm` apply when failure tallies show a characteristic defect. Many frontier models sharing `balanced` is expected.

### Bootstrap + first-use queue

1. **Bootstrap** — `evals/bootstrapModels.ts` lists **unassessed / retry** OpenRouter ids only. Exact assessments under the current baseline are skipped (no re-spend on known-good models). Local Ollama models are not listed (`local-slm` family covers them).
2. **Hosted first-use** — when a hosted agent uses an unassessed model, it fire-and-forgets to the control plane queue (`POST /model-behavior/sightings`). Chat never waits.
3. **CI** — weekly/on-demand job evaluates pending queue (+ optional bootstrap), writes exact assessments, opens a PR. Empty queue → clean exit, no PR.

Empty-response / fast-fail scoreboards (bad model slug) are skipped as inconclusive — not written as `tool-shy`.

Browser BYOK sightings stay in `localStorage` / hand-export for this phase (no frontend telemetry upload).

| Source | Path / API |
|---|---|
| Bootstrap | `evals/bootstrapModels.ts` |
| Hosted queue | control plane + Supabase `model_behavior_sightings` |
| Hand-export / CI | `packages/agent-llm/evals/sightings.local.json` (gitignored) |
| Hosted local file | `$ATOM_DATA_DIR/model-behavior-sightings.json` |
| Browser | `localStorage` key `atom.modelBehavior.sightings.v1` |

## Local / fork usage

```bash
# Print current registry + sample resolutions (no API key)
pnpm --filter @qwixl/agent-llm admin:model-behavior

# Evaluate unassessed candidates (bootstrap if queue empty, or --bootstrap)
export LLM_BASE_URL=https://openrouter.ai/api/v1
export OPENROUTER_API_KEY=sk-or-...
pnpm --filter @qwixl/agent-llm admin:model-behavior -- --eval --write --bootstrap

# Pin exact models (full override)
export EVAL_MODELS=openai/gpt-4o-mini,anthropic/claude-sonnet-4
pnpm --filter @qwixl/agent-llm admin:model-behavior -- --eval --write
```

Categorization runs under a **neutral `balanced` profile** (no tool-shy/eager addenda) so scores reflect raw tool judgment.

## Cron / CI (maintainers)

[`.github/workflows/model-behavior-admin.yml`](./.github/workflows/model-behavior-admin.yml):

1. Prints registry
2. Fetches pending queue (when `ATOM_CONTROL_PLANE_URL` + `ATOM_PROVISION_SECRET` set)
3. Runs `--eval --write` on unassessed candidates only
4. Uploads registry artifact; opens PR when changes exist
5. Acks queue rows (`proposed` / requeue on PR failure)

**Secrets:** `OPENROUTER_API_KEY`, `ATOM_CONTROL_PLANE_URL`, `ATOM_PROVISION_SECRET`  
**Variables:** optional `LLM_BASE_URL`, `EVAL_MODELS`

**Required repo setting:** Actions → allow GitHub Actions to create PRs.

## What this is not

- Not a Chat or Settings UI for end users  
- Not permission to embed vendor keys in source  
- Not shell-side keyword routing of user intents  
- Not unbounded self-rewriting of the system prompt — only allowlisted class knobs  
- Not weekly re-scoring of already assessed models

## Related

- Tool-judgment evals: `pnpm --filter @qwixl/agent-llm eval:tools`  
- Package: `@qwixl/agent-llm`  
- Contributing principles: [CONTRIBUTING.md](./CONTRIBUTING.md)
