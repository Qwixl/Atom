# Atom

[![npm agent-backend](https://img.shields.io/npm/v/@qwixl/agent-backend?label=agent-backend)](https://www.npmjs.com/package/@qwixl/agent-backend)
[![License](https://img.shields.io/github/license/Qwixl/Atom)](LICENSE)

**A browser for the agent web.**

An open, user-owned shell for agent-driven interfaces. Your agent composes a declarative description of the UI; your shell renders it from a trusted catalog of components. Counterpart agents send data, never pixels — and actions of consequence only ever happen in shell-owned chrome.

## Why Atom

Agent-rendered UI is becoming standard: MCP Apps, A2UI, and vendor app SDKs all let tools return interactive widgets inside a conversation. Atom shares the composition-not-code approach (the composition model follows the A2UI shape) but inverts the platform structure:

| | Chat-platform apps (MCP Apps, vendor SDKs) | Atom |
|---|---|---|
| **Host ownership** | The AI vendor's chat product owns identity, data, distribution | The user's shell — open source, self-hostable, federated module registry |
| **Rendering direction** | Businesses ship widgets into the vendor's surface | The owner's agent composes UI for the owner from a shell-trusted catalog |
| **Counterparty channel** | Server-side tools called by the vendor's model | Signed data objects over encrypted A2A/MLS sessions; counterparts send data, never pixels |
| **Trust boundary** | Host-vendor sandbox policy | Sandbox **plus** owner-side chrome: consequential actions in shell-owned UI, hash-chained attestation log, per-use approval for guarded data |
| **Model coupling** | The vendor's model | Any OpenAI-compatible endpoint, including fully local |

The premise: interfaces are shifting from "chat with occasional UI" to **model-driven UI with chat attached**. Atom makes the owner's portal the interface for all of it — agents coordinate in the background over A2A instead of driving human-centric websites, and the result is rendered once, owner-side. Incumbent platforms bake the opposite assumption into their infrastructure: the vendor's chat app is the platform, and everyone else is a widget inside it.

## Start here

Two ways to use Atom — pick one and stay in it:

| Mode | Command | You never need… |
|---|---|---|
| **Browser** | `pnpm dev` then open http://localhost:5200 | A second terminal, admin URLs, or tokens |
| **Terminal** | `pnpm atom agent start` then `pnpm atom status` | The browser (use https://atom.qwixl.com when you want UI) |

Self-host with npm: `npx @qwixl/agent-backend` (terminal) or pair with [atom.qwixl.com](https://atom.qwixl.com) (browser).

Try the **personal demo** (LLM + WebCal + scheduling): `pnpm dev:demo` — [PERSONAL-DEMO.md](./PERSONAL-DEMO.md). For MLS with a counterpart agent, see [DEMO-PEER.md](./DEMO-PEER.md).

Developer docs (tutorial, playground, modules): run `pnpm dev:docs` or read [DEVELOPERS.md](./DEVELOPERS.md).

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
| `@qwixl/protocol` | yes | Data-object model, did:key identity, signed envelopes, governance policy. |
| `@qwixl/a2a-transport` | yes | A2A wire format for signed data objects + MLS handshake. |
| `@qwixl/mls-session` | yes | RFC 9420 MLS pair sessions for agent backends. |
| `@qwixl/agent-backend` | yes | Self-hostable owner agent (`atom-agent` CLI): A2A + MLS + admin API. |
| `@qwixl/business-index` | yes | Client-side filter/query for federated business-agent indexes (M15.7). |
| `@qwixl/skin-default` | yes | Default shell design tokens and alternate skins (M14.2). |
| `@qwixl/agent-llm` | yes | LLM-backed `AgentSession` for the reference shell. |
| `@qwixl/secret-store` | monorepo only | Pluggable secret storage for connection credentials. |

Reference apps (not published): `apps/shell`, `apps/embed-demo`, `apps/docs-site`, `apps/control-plane`, `apps/ag-ui-server`, `apps/registry-host`.

## Install (consumers)

```bash
pnpm add @qwixl/shell-core @qwixl/renderer-web react
# optional adapters
pnpm add @qwixl/a2ui-adapter @qwixl/ag-ui-adapter @qwixl/owner-store
```

Build your app with any bundler that resolves the package `development` export condition in dev (Vite, etc.). See **[EMBED.md](./EMBED.md)** for a <1 hour integration guide.

## Guides

| Doc | Audience |
|---|---|
| [EMBED.md](./EMBED.md) | Third-party hosts embedding the engine |
| [MODULES.md](./MODULES.md) | Module authors publishing to a registry |
| [API-v1.md](./API-v1.md) | Frozen v1 contracts (composition, session, manifest, sandbox) |
| [AGENT-BACKEND.md](./AGENT-BACKEND.md) | Self-hosting the owner agent backend |
| [DEVELOPERS.md](./DEVELOPERS.md) | M14 developer platform entry |
| [PERSONAL-DEMO.md](./PERSONAL-DEMO.md) | Guided personal demo (`pnpm dev:demo`) |
| [DEMO-PEER.md](./DEMO-PEER.md) | Live demo counterpart agent (M14.6) |
| [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) | M16 public push gates |
| [PROTOCOL-v1.md](./PROTOCOL-v1.md) | Frozen v1 data-object + did:key contracts |
| [SECURITY.md](./SECURITY.md) | Threat model for shipped surface |
| [SECRET-STORE.md](./SECRET-STORE.md) | Credential adapter priority for embedders |

Live hosts: [atom.qwixl.com](https://atom.qwixl.com) · [atom.registry.qwixl.com](https://atom.registry.qwixl.com)

## Quick start (monorepo)

```bash
pnpm install
pnpm build:packages   # compile publishable packages to dist/
pnpm dev              # browser mode: agent + shell on http://localhost:5200
pnpm atom agent start   # terminal mode: your agent only (Atom is hosted)
pnpm atom platform      # show hosted Atom URL
pnpm atom status        # your agent identity
pnpm atom discover search "coffee"
pnpm atom rooms join room:coffeeshop --host http://127.0.0.1:5205
pnpm atom rooms send room:coffeeshop --message "Hello"
pnpm atom chat "what's on today?"
pnpm dev:shell-only   # shell only (advanced; needs separate agent)
pnpm dev:demo         # personal demo: shell + your agent (see PERSONAL-DEMO.md)
pnpm dev:embed        # embed demo on http://localhost:5203 (?playground=1 for JSON editor)
pnpm dev:docs         # docs site on http://localhost:5206
pnpm dev:hosting      # control plane :5300 + stub hosted agent :5301
pnpm dev:control-plane # control plane only :5300
pnpm dev:agent-only   # agent backend only (terminal / advanced)
pnpm dev:a2a          # alias for dev:agent-only
pnpm start:agent      # run built atom-agent CLI (after build:packages)
pnpm docker:agent     # Docker Compose self-host (see AGENT-BACKEND.md)
pnpm docker:demo-peer # demo peer agent on http://localhost:5205
pnpm dev:registry     # module registry host on http://localhost:5202
pnpm registry:verify  # verify index + manifest + bundle hashes
pnpm registry:publish-all # recompute all module hashes in default registry
pnpm registry:scaffold -- --id acme/widget --out ./tmp/widget  # module template
pnpm test             # shell-core contract tests
pnpm typecheck        # all packages
pnpm build            # packages + deployable apps
```

Try the mock-agent demos (no API keys needed):

- **"Schedule a team standup next week"** (mock agent) — time slot choice → shell-chrome **confirmation** → opens Google Calendar prefilled (save there).
- **"RSVP to the design review"** — accept/decline → confirmation in shell chrome.
- **"What time works for our standup?"** — guarded preference disclosure: add a guarded record in **Profile**, then ask; shell permission chrome → attestation → agent proposes filtered slots.
- **AG-UI + A2UI:** switch to **AG-UI** provider, ask **"a2ui schedule standup"** — surfaces arrive as A2UI v0.9.1 envelopes.
- **"Show me my spending"** — compositions referencing uninstalled modules, degrading gracefully to semantic-role substitution.

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
| `shell-atom` | `apps/shell` | https://atom.qwixl.com |
| `atom-registry` | `apps/registry-host` | https://atom.registry.qwixl.com |

Both projects connect to `Qwixl/Atom` on GitHub. In each Vercel project's **Settings → General → Root Directory**, set the path above so monorepo builds resolve `workspace:*` deps.

Build settings (also in each app's `vercel.json`):

**shell-atom** — install: `cd ../.. && pnpm install` · build: `cd ../.. && pnpm build:packages && pnpm --filter @qwixl/shell-app build` · output: `dist`

**atom-registry** — install: `cd ../.. && pnpm install` · build: `cd ../.. && pnpm --filter @qwixl/registry-host build` · output: `dist`

Set the shell's registry URL in Settings to `https://atom.registry.qwixl.com` when testing cross-host module loads.

Optional GitHub Actions deploy (`.github/workflows/deploy.yml`) requires secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_SHELL_ATOM`, `VERCEL_PROJECT_ID_ATOM_REGISTRY`.

## Status

Shell platform v0.1.1 — live at [atom.qwixl.com](https://atom.qwixl.com) and [atom.registry.qwixl.com](https://atom.registry.qwixl.com). Packages on npm: [@qwixl/shell-core](https://www.npmjs.com/package/@qwixl/shell-core) and siblings. After clone, `pnpm registry:verify` must pass before publish/deploy.

## Support the project

Atom is free and open source. If you want to fund continued platform work, [buy us a coffee](https://buymeacoffee.com/qwixl.atom) — or use the GitHub **Sponsor** button (Buy Me a Coffee). Thank you.

## License

[Apache 2.0](./LICENSE)
