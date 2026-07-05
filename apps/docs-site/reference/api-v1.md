# API v1

Frozen contracts for composition model, agent session, module manifest, and iframe sandbox.

Key surfaces:

- **Composition** — `version`, `surfaceId`, `root` tree with `component`, `props`, `children`, `events`.
- **Module manifest** — `id`, `version`, `publisher`, `bundleUrl`, `bundleIntegrity`, `components[]`, `capabilities: []`.
- **Sandbox** — `ready` / `init` / `event` postMessage bridge.

See [API-v1.md](https://github.com/Qwixl/Atom/blob/main/API-v1.md) for the complete specification.
