# Contributing to Atom

Thanks for helping build an open, user-owned shell for agent-driven UI.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Where to start

| Goal | Doc |
|---|---|
| Product overview | [README.md](./README.md) |
| Developer entry | [DEVELOPERS.md](./DEVELOPERS.md) |
| Embed the engine | [EMBED.md](./EMBED.md) |
| Author a module | [MODULES.md](./MODULES.md) |
| Self-host an agent | [AGENT-BACKEND.md](./AGENT-BACKEND.md) |
| Security model | [SECURITY.md](./SECURITY.md) |
| Model behavior admin (ops) | [MODEL-BEHAVIOR-ADMIN.md](./MODEL-BEHAVIOR-ADMIN.md) |
| Frozen contracts | [API-v1.md](./API-v1.md), [PROTOCOL-v1.md](./PROTOCOL-v1.md) |

**Discussions** ([GitHub Discussions](https://github.com/Qwixl/Atom/discussions)) — ideas, Q&A, show-and-tell.  
**Issues** — bugs and concrete feature proposals (use the templates).  
**Security vulnerabilities** — [GitHub Security Advisories](https://github.com/Qwixl/Atom/security/advisories/new) (not public issues). See [SECURITY.md](./SECURITY.md).  
**Abuse / CoC** — `abuse@qwixl.dev`.

## Design principles (non-negotiable)

Atom is **agent-led composition**, not a catalog of one-off Chat widgets:

1. The owner’s agent emits a **composition tree** from a fixed vocabulary (`core/*` primitives + registry modules).
2. The **shell** resolves, sandboxes, and owns consequential-action chrome — it does **not** parse user intent with keyword routers.
3. Read-only UI = primitives + skins/tokens. Interactive / two-party flows = **registry modules**.
4. Do **not** add free-form HTML/CSS/JS generation from the model (phishing surface).
5. Prefer improving prompts, tokens, or generic renderers before inventing task-specific shell views.

If a change fights these principles, open a Discussion first.

## Dev setup

```bash
pnpm install
pnpm build:packages
pnpm typecheck
pnpm test
pnpm dev              # shell + agent — http://localhost:5200
```

Useful targets: `pnpm registry:verify`, `pnpm dev:docs`, `pnpm docker:agent`. See README for the full script list.

Node + pnpm versions: follow the repo `packageManager` field / CI (`pnpm` via Corepack).

## Pull requests

1. Fork and branch from `main`.
2. Keep PRs focused — one concern per PR when practical.
3. Ensure **CI green**: `pnpm typecheck`, `pnpm test`, `pnpm build` (and `pnpm registry:verify` if you touch curated registry listings).
4. Use the PR template. Link related issues.
5. Do **not** commit secrets, `.env`, service-role keys, or private working notes.
6. Commit messages: short imperative subject; explain *why* in the body when non-obvious.

### What belongs in this public repo

Package sources, apps, configs, lockfile, public markdown guides, LICENSE.

### What does **not** belong

Operator-only material (private design notes, local Supabase migration dumps you treat as private, machine-local Cursor rules, real project credentials). If unsure, ask in a Discussion before opening a PR that adds new top-level trees.

## Modules and registry

- Scaffold: `pnpm registry:scaffold -- --id your-org/widget --out ./tmp/widget`
- After edits under `apps/shell/public/registry/`: `pnpm registry:publish-all` then `pnpm registry:verify`
- Production curated listings require integrity + Sigstore bundles — see [SECURITY.md](./SECURITY.md) and [MODULES.md](./MODULES.md)

## License

Contributions are licensed under the [Apache License 2.0](./LICENSE).
