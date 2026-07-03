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
| `@qwixl/shell-core` | yes | Embeddable engine: composition model, catalog, resolver, validation, attestation log, agent session contract. |
| `@qwixl/renderer-web` | yes | React renderer for core primitives and sandboxed module iframes, with plain-render fallback. |
| `@qwixl/a2ui-adapter` | yes | A2UI v0.9.1 wire format → Atom composition model. |
| `@qwixl/ag-ui-adapter` | yes | AG-UI wire transport implementing `AgentSession`. |
| `@qwixl/owner-store` | yes | Owner-controlled profile/memory store with guarded disclosure. |
| `@qwixl/registry-tools` | yes | CLI: hash, verify, and publish module registry indexes. |
| `@qwixl/agent-llm` | monorepo only | LLM-backed `AgentSession` for the reference shell. |
| `@qwixl/secret-store` | monorepo only | Pluggable secret storage for connection credentials. |

Reference apps (not published): `apps/shell`, `apps/embed-demo`, `apps/ag-ui-server`, `apps/registry-host`.

## Install (consumers)

```bash
pnpm add @qwixl/shell-core @qwixl/renderer-web react
# optional adapters
pnpm add @qwixl/a2ui-adapter @qwixl/ag-ui-adapter @qwixl/owner-store
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
- **AG-UI + A2UI:** switch to **AG-UI** provider, ask **"a2ui flight to Tokyo"** — surfaces arrive as A2UI v0.9.1 envelopes and render via `@qwixl/a2ui-adapter`.
- **"Which seats should I book?"** — guarded preference disclosure: add a guarded record in **Profile**, then ask; shell permission chrome → attestation → agent receives disclosed records only after approval.
- **"Show me my spending"** — compositions referencing uninstalled modules, degrading gracefully to semantic-role substitution and raw fallback.

Or switch to **AG-UI** in the app header (start `pnpm dev:ag-ui` first), or **Live LLM** and configure any OpenAI-compatible endpoint in Settings.

Add records in the **Profile** panel — open records personalize the LLM agent; guarded records require shell chrome approval.

## Publish (maintainers)

Packages publish under the **`@qwixl` npm org** (the `@atom` scope was taken). This is separate from the Qwixl product monorepo.

### 1. Create the npm org (once)

1. Sign in at [npmjs.com](https://www.npmjs.com/) (create an account if needed).
2. Open [npmjs.com/org/create](https://www.npmjs.com/org/create) and create org **`qwixl`** (free plan is fine).
3. Confirm your user is a member with publish access to `@qwixl`.

### 2. Log in locally

In a terminal (interactive — opens browser or prompts for OTP):

```bash
npm login
npm whoami   # should print your npm username
```

### 3. Create a publish token for GitHub Actions

1. [npmjs.com/settings/~tokens](https://www.npmjs.com/settings/~/tokens) → **Generate New Token** → **Granular Access Token**.
2. Name: `github-actions-qwixl-publish`
3. Expiration: your choice (90 days or no expiration).
4. Packages and scopes: **Read and write** on org **`qwixl`** (or all packages in that org).
5. Enable **Bypass two-factor authentication (2FA)** for publish — required for CI and non-interactive publish.
6. Copy the token (`npm_...`) — npm shows it once.

### 4. Add `NPM_TOKEN` to GitHub

From any machine with `gh` logged in:

```bash
gh secret set NPM_TOKEN --repo Qwixl/Atom
```

Paste the token when prompted (nothing echoes — that's normal).

### 5. Publish

**First publish (v0.1.0):**

```bash
# Option A: one-off local publish (paste your real npm_... token, not a placeholder)
npm config set //registry.npmjs.org/:_authToken npm_PASTE_YOUR_TOKEN_HERE
pnpm build:packages
pnpm publish -r --filter "@qwixl/shell-core" --filter "@qwixl/renderer-web" --filter "@qwixl/a2ui-adapter" --filter "@qwixl/ag-ui-adapter" --filter "@qwixl/owner-store" --filter "@qwixl/registry-tools" --access public --no-git-checks
npm logout   # optional: clear token from local config when done
```

If local publish fails with 401/404 after `npm config set`, run `npm login` again — a bad token overrides your login session.

Or push tag `v0.1.1` after updating `NPM_TOKEN` in GitHub secrets (the `v0.1.0` tag predates the `@qwixl` rename).

**Later releases** (after changesets):

```bash
pnpm changeset
pnpm version-packages
git add -A && git commit -m "Version packages" && git push
pnpm release
```

Or push a tag `v*` to trigger `.github/workflows/release.yml` (runs `pnpm release` with `NPM_TOKEN`).

## Deploy reference hosts

Atom deploys as **separate Vercel projects** from the [`Qwixl/Atom`](https://github.com/Qwixl/Atom) repo. This is independent of the Qwixl product monorepo and its Vercel project.

| Project | Root directory | Production URL |
|---|---|---|
| `shell-atom` | `apps/shell` | https://shell-atom.vercel.app |
| `atom-registry` | `apps/registry-host` | https://atom-registry.vercel.app |

Both projects connect to `Qwixl/Atom` on GitHub. In each Vercel project's **Settings → General → Root Directory**, set the path above so monorepo builds resolve `workspace:*` deps.

Build settings (also in each app's `vercel.json`):

**shell-atom** — install: `cd ../.. && pnpm install` · build: `cd ../.. && pnpm build:packages && pnpm --filter @qwixl/shell-app build` · output: `dist`

**atom-registry** — install: `cd ../.. && pnpm install` · build: `cd ../.. && pnpm --filter @qwixl/registry-host build` · output: `dist`

Set the shell's registry URL in Settings to `https://atom-registry.vercel.app` when testing cross-host module loads.

Optional GitHub Actions deploy (`.github/workflows/deploy.yml`) requires secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_SHELL_ATOM`, `VERCEL_PROJECT_ID_ATOM_REGISTRY`.

## Status

Shell platform v0.1.0 — live at [shell-atom.vercel.app](https://shell-atom.vercel.app) and [atom-registry.vercel.app](https://atom-registry.vercel.app). Packages on npm: [@qwixl/shell-core](https://www.npmjs.com/package/@qwixl/shell-core) and siblings.

## License

[Apache 2.0](./LICENSE)
