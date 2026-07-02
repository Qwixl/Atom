# Atom

**A browser for the agent web.**

An open, user-owned shell for agent-driven interfaces. Your agent composes a declarative description of the UI; your shell renders it from a trusted catalog of components. Counterpart agents send data, never pixels — and actions of consequence only ever happen in shell-owned chrome.

## Principles

- **Composition, not code generation.** Agents emit declarative compositions resolved against a catalog of vetted components. No arbitrary code crosses the agent boundary.
- **The user owns the shell.** Rendering, trust decisions, and confirmation chrome belong to the person running it, not to any platform or counterpart.
- **Nothing fails to render.** Every composition carries enough semantic structure to degrade to a plain, functional fallback when a component is missing.
- **Attested decisions.** Every consequential action is recorded in a local, hash-chained attestation log with the exact terms displayed at decision time.
- **Embeddable by design.** The engine (`shell-core`) is a standalone library any agent product can embed; the app is the reference host.

## Packages

| Package | Purpose |
|---|---|
| `packages/shell-core` | Embeddable engine: composition model, component catalog, resolver, validation, attestation log, agent-session contract. Zero runtime dependencies. |
| `packages/renderer-web` | React renderer for the core primitives, with plain-render fallback and form-scoped choices. |
| `packages/agent-llm` | LLM-backed `AgentSession`: OpenAI-compatible endpoint, catalog-driven system prompt, composition validation before render. |
| `apps/shell` | Standalone shell reference app: feed, composer, shell-owned confirmation chrome, attestation log viewer, mock agent + live LLM mode. |

## Quick start

```bash
pnpm install
pnpm dev        # shell app on http://localhost:5199
pnpm typecheck  # all packages
pnpm build      # production build
```

Try the mock-agent demos (no API keys needed):

- **"Book me a flight to Tokyo"** — choice surface → shell-chrome payment confirmation → attested receipt.
- **"Show me my spending"** — compositions referencing uninstalled modules, degrading gracefully to semantic-role substitution and raw fallback.

Or switch to **Live LLM** in the app header, configure any OpenAI-compatible endpoint in Settings, and compose unscripted surfaces from the core vocabulary.

## Status

Early v1. Validated: live LLM composition from core vocabulary, form-scoped multi-question surfaces, shell-owned consequential-action chrome + attestation log. Next: module sandbox/registry (proof point 2), AG-UI transport adapter, embeddable-engine demo (proof point 4).

## License

[Apache 2.0](./LICENSE)
