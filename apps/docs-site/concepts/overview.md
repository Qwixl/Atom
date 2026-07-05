# Overview

Atom is an open, user-owned shell for agent-driven interfaces. Your agent composes a declarative description of the UI; your shell renders it from a trusted catalog of components.

## Three tiers

1. **Personal agent** — owner backend (`@qwixl/agent-backend`) holding keys, store, and A2A/MLS sessions.
2. **Interface shell** — `@qwixl/shell-core` + `@qwixl/renderer-web` (reference app: `apps/shell`).
3. **Counterpart agents** — businesses and peers send signed data objects, never pixels.

## What ships in v1

- Core primitive catalog + sandboxed module iframes
- Module registry with integrity verification
- A2A + MLS E2E for agent backends
- Owner profile store with guarded disclosure
- Skins via DTCG-style tokens (`@qwixl/skin-default`)

See the [module author tutorial](/guides/module-author-tutorial) to publish your first module.
