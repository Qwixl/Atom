# Atom

**A browser for the agent web.**

An open, user-owned shell for agent-driven interfaces. Your agent composes a declarative description of the UI; your shell renders it from a trusted catalog of components. Counterpart agents send data, never pixels — and actions of consequence only ever happen in shell-owned chrome.

## Principles

- **Composition, not code generation.** Agents emit declarative compositions resolved against a catalog of vetted components. No arbitrary code crosses the agent boundary.
- **The user owns the shell.** Rendering, trust decisions, and confirmation chrome belong to the person running it, not to any platform or counterpart.
- **Nothing fails to render.** Every composition carries enough semantic structure to degrade to a plain, functional fallback when a component is missing.
- **Attested decisions.** Every consequential action is recorded in a local, hash-chained attestation log with the exact terms displayed at decision time.
- **Memory belongs to the owner.** Profile and preferences live in a portable store, not in the model or the platform. The model gets scoped slices per session; guarded records require explicit approval in shell chrome, every time.
- **Embeddable by design.** The engine (`shell-core`) is a standalone library any agent product can embed; the app is the reference host.

## Packages

| Package | Purpose |
|---|---|
| `packages/shell-core` | Embeddable engine: composition model, component catalog, resolver, validation, attestation log, agent-session contract. Zero runtime dependencies. |
| `packages/renderer-web` | React renderer for core primitives and sandboxed module iframes, with plain-render fallback and form-scoped choices. |
| `packages/a2ui-adapter` | A2UI v0.9.1 wire format → Atom composition model; basic catalog mapping; AG-UI `a2ui.message` CUSTOM event support. |
| `packages/ag-ui-adapter` | AG-UI wire transport: `AgUiAgentSession` implements `AgentSession` via `@ag-ui/client` HttpAgent; Atom + A2UI CUSTOM event mapping. |
| `packages/agent-llm` | LLM-backed `AgentSession`: OpenAI-compatible endpoint, catalog-driven system prompt, composition validation before render. |
| `packages/owner-store` | Owner-controlled profile/memory store: portable records, guarded categories requiring per-interaction chrome approval, scoped context slices. |
| `apps/shell` | Standalone shell reference app: feed, composer, shell-owned confirmation chrome, attestation log viewer, mock agent + live LLM mode. |
| `apps/embed-demo` | Minimal third-party host embedding `shell-core` + `renderer-web`; includes cross-host registry demo tab. |
| `packages/registry-tools` | CLI: hash, verify, and publish module registry indexes with integrity hashes. |
| `apps/registry-host` | Reference static registry host (port 5202) for cross-origin module loads. |

## Quick start

```bash
pnpm install
pnpm dev        # shell app on http://localhost:5199
pnpm dev:embed  # embed demo on http://localhost:5200
pnpm dev:ag-ui  # AG-UI reference server on http://localhost:5201/agent
pnpm dev:registry  # module registry host on http://localhost:5202
pnpm registry:verify   # verify index + manifest + bundle hashes
pnpm registry:publish  # recompute hashes and update index.json
pnpm typecheck  # all packages
pnpm build      # production build
```

Try the mock-agent demos (no API keys needed):

- **"Book me a flight to Tokyo"** — flight choice → `travel/seat-map` module (iframe sandbox) → shell-chrome payment confirmation → attested receipt. Toggle **Modules off** in the header to skip the module step.
- **AG-UI + A2UI:** switch to **AG-UI** provider, ask **"a2ui flight to Tokyo"** — surfaces arrive as A2UI v0.9.1 envelopes and render via `@atom/a2ui-adapter`.
- **"Which seats should I book?"** — guarded preference disclosure: add a guarded record in **Profile**, then ask; shell permission chrome → attestation → agent receives disclosed records only after approval.
- **"Show me my spending"** — compositions referencing uninstalled modules, degrading gracefully to semantic-role substitution and raw fallback.

Or switch to **AG-UI** in the app header (start `pnpm dev:ag-ui` first), or **Live LLM** and configure any OpenAI-compatible endpoint in Settings.

Add records in the **Profile** panel — open records personalize the LLM agent; guarded records require shell chrome approval.

## Status

Early v1. All four proof points passed at v1 scope. Module registry, A2UI wire adapter, AG-UI transport, curator pass at reference scope. Sigstore runtime verify deferred.

## License

[Apache 2.0](./LICENSE)
