# Model behavior administration

**Internal ops / maintenance — not a product Settings feature.**

Atom’s Chat tool loop behaves differently across models (some under-invoke connectors; some over-call). Maintainers can assign **behavior classes** so the runtime applies allowlisted knobs (`tool_choice`, prompt addendum, whether the deprecated `atom_connector_invoke` alias is exposed). Assignments live in a **secret-free** registry committed with the code.

Anyone forking or running locally gets this machinery. **API keys never ship in the repo** — use env vars / CI secrets only.

## Behavior classes

| Class | When to use | Runtime knobs (v1) |
|---|---|---|
| `tool-eager` | Models that call tools readily (may over-call) | `tool_choice: auto`, deprecated alias **on**, light “don’t over-call” addendum |
| `balanced` | Default / unknown models | `tool_choice: auto`, alias on, no extra addendum |
| `tool-shy` | Models that answer from context instead of invoking (e.g. some frontier chat models on Atom’s eval) | `tool_choice: auto`, alias on, **strong invoke** system addendum |
| `local-slm` | Small / local models with weaker tool+JSON discipline | `tool_choice: auto`, alias **off** (fewer tools), local-slm protocol addendum |

Source of truth: [`packages/agent-llm/src/modelBehaviorRegistry.json`](./packages/agent-llm/src/modelBehaviorRegistry.json)  
Resolver: `@qwixl/agent-llm` → `resolveModelBehavior(modelId)`.

### What the seed list is (and is not)

- Assignments are **substring patterns**, not an allowlist of every chat model on earth (`gpt-4o` matches `openai/gpt-4o-2024-08-06`, `claude` matches Claude family ids, etc.).
- **Any model that matches no pattern uses `defaultClassId` → `balanced`.** Chat still works; it does not get a custom class until ops scores it.
- **Selecting a model in Settings does not write the registry.** There is no product UI that enrolls models into classes. Chat may **sight** the model id (localStorage / agent data dir) for ops discovery only — never API keys.

### Sightings (ops discovery)

When `EVAL_MODELS` is unset, `admin:model-behavior --eval` evaluates the default shortlist **plus** up to 12 model ids from sightings files:

| Source | Path |
|---|---|
| Hand-export / CI | `packages/agent-llm/evals/sightings.local.json` (gitignored via `*.local.*`) |
| Hosted agent | `$ATOM_DATA_DIR/model-behavior-sightings.json` — set `MODEL_BEHAVIOR_SIGHTINGS` to that path (PATH-delimited for multiple) |
| Browser Live LLM | `localStorage` key `atom.modelBehavior.sightings.v1` — copy JSON into `sightings.local.json` for the admin job |

So: seeds bias known families; sightings pull in models people actually configure; unmatched ids stay `balanced` until scored.

## Local / fork usage

```bash
# Print current registry + class resolution for sample models (no API key)
pnpm --filter @qwixl/agent-llm admin:model-behavior

# Run tool-judgment eval then propose/write class moves (needs a key)
export LLM_BASE_URL=https://openrouter.ai/api/v1   # or OpenAI-compatible host
export OPENROUTER_API_KEY=sk-or-...                 # or LLM_API_KEY / OPENAI_API_KEY
# Optional: pin exact models (skips sightings merge)
export EVAL_MODELS=openai/gpt-4o-mini,openai/gpt-4o
# Optional: merge hosted sightings file(s)
export MODEL_BEHAVIOR_SIGHTINGS=/path/to/model-behavior-sightings.json
pnpm --filter @qwixl/agent-llm admin:model-behavior -- --eval --write
```

- `--eval` — run tool-judgment shortlist (defaults ∪ sightings, or `EVAL_MODELS`) and score failure classes  
- `--write` — update `modelBehaviorRegistry.json` from scores (still **no secrets** in the file)  
- Without `--eval`, the script prints the registry and any loaded sightings (safe offline)

Review the JSON diff, run `pnpm --filter @qwixl/agent-llm test`, commit.

## Cron / CI (maintainers)

Qwixl (or a fork) can schedule a weekly job (GitHub Actions). Store `OPENROUTER_API_KEY` (or `LLM_API_KEY`) as a **secret**.

With a key configured, [`.github/workflows/model-behavior-admin.yml`](./.github/workflows/model-behavior-admin.yml):

1. Runs `admin:model-behavior --eval --write`
2. Uploads the registry JSON as an artifact
3. Opens a PR (`chore/model-behavior-admin`) when `modelBehaviorRegistry.json` changed — **human review, no auto-merge**

Without a key, the workflow only prints the registry (dry-run).

Optional repo **variables**: `LLM_BASE_URL`, `EVAL_MODELS` (pins shortlist; when unset, defaults ∪ sightings), `MODEL_BEHAVIOR_SIGHTINGS` (path if a sightings file is checked out or mounted).

## What this is not

- Not a Chat or Settings UI for end users  
- Not permission to embed vendor keys in source  
- Not shell-side keyword routing of user intents  
- Not unbounded self-rewriting of the system prompt — only allowlisted class knobs

## Related

- Tool-judgment evals: `pnpm --filter @qwixl/agent-llm eval:tools`  
- Package: `@qwixl/agent-llm`  
- Contributing principles: [CONTRIBUTING.md](./CONTRIBUTING.md)
