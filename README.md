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

| Package | npm | Purpose |
|---|---|---|
| `@atom/shell-core` | yes | Embeddable engine: composition model, catalog, resolver, validation, attestation log, agent session contract. |
| `@atom/renderer-web` | yes | React renderer for core primitives and sandboxed module iframes, with plain-render fallback. |
| `@atom/a2ui-adapter` | yes | A2UI v0.9.1 wire format → Atom composition model. |
| `@atom/ag-ui-adapter` | yes | AG-UI wire transport implementing `AgentSession`. |
| `@atom/owner-store` | yes | Owner-controlled profile/memory store with guarded disclosure. |
| `@atom/registry-tools` | yes | CLI: hash, verify, and publish module registry indexes. |
| `@atom/agent-llm` | monorepo only | LLM-backed `AgentSession` for the reference shell. |
| `@atom/secret-store` | monorepo only | Pluggable secret storage for connection credentials. |

Reference apps (not published): `apps/shell`, `apps/embed-demo`, `apps/ag-ui-server`, `apps/registry-host`.

## Install (consumers)

```bash
pnpm add @atom/shell-core @atom/renderer-web react
# optional adapters
pnpm add @atom/a2ui-adapter @atom/ag-ui-adapter @atom/owner-store
```

Build your app with any bundler that resolves the package `development` export condition in dev (Vite, etc.).

## Quick start (monorepo)

```bash
pnpm install
pnpm build:packages   # compile publishable packages to dist/
pnpm dev              # reference shell on http://localhost:5200
pnpm dev:embed        # embed demo on http://localhost:5203
pnpm dev:ag-ui        # AG-UI reference server on http://localhost:5201/agent
pnpm dev:registry     # module registry host on http://localhost:5202
pnpm registry:verify  # verify index + manifest + bundle hashes
pnpm registry:publish # recompute hashes and update index.json
pnpm test             # shell-core contract tests
pnpm typecheck        # all packages
pnpm build            # packages + deployable apps
```

Try the mock-agent demos (no API keys needed):

- **"Book me a flight to Tokyo"** — flight choice → `travel/seat-map` module (iframe sandbox) → shell-chrome payment confirmation → attested receipt. Toggle **Modules off** in the header to skip the module step.
- **AG-UI + A2UI:** switch to **AG-UI** provider, ask **"a2ui flight to Tokyo"** — surfaces arrive as A2UI v0.9.1 envelopes and render via `@atom/a2ui-adapter`.
- **"Which seats should I book?"** — guarded preference disclosure: add a guarded record in **Profile**, then ask; shell permission chrome → attestation → agent receives disclosed records only after approval.
- **"Show me my spending"** — compositions referencing uninstalled modules, degrading gracefully to semantic-role substitution and raw fallback.

Or switch to **AG-UI** in the app header (start `pnpm dev:ag-ui` first), or **Live LLM** and configure any OpenAI-compatible endpoint in Settings.

Add records in the **Profile** panel — open records personalize the LLM agent; guarded records require shell chrome approval.

## Publish (maintainers)

Requires an npm org with access to the `@atom` scope.

```bash
pnpm build:packages
pnpm changeset          # describe the change (linked packages bump together)
pnpm version-packages   # apply versions + changelog
pnpm release            # build + npm publish (requires npm login)
```

## Deploy reference hosts

Build first: `pnpm build:apps`

**Reference shell** (`apps/shell`):

- Vercel project root: `apps/shell`
- Build command: `cd ../.. && pnpm install && pnpm build:packages && pnpm --filter @atom/shell-app build`
- Output directory: `dist`

**Module registry** (`apps/registry-host`):

- Vercel project root: `apps/registry-host`
- Build command: `cd ../.. && pnpm install && pnpm --filter @atom/registry-host build`
- Output directory: `dist`
- CORS headers are set in `vercel.json` for cross-origin module loads.

Set the shell's registry URL in Settings to the deployed registry origin when testing cross-host module loads.

## Status

Shell platform v0.1.0 — proof points passed; packages build to `dist/` with changesets; CI runs typecheck, contract tests, and builds. npm publish and public deploy URLs pending org setup.

## License

[Apache 2.0](./LICENSE)
