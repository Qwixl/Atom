# Publish a shell module

Modules are **pure renderers**: sandboxed iframe bundles registered in a static index. The public registry host is [atom.registry.qwixl.com](https://atom.registry.qwixl.com).

## Quick start

```bash
pnpm add -D @qwixl/registry-tools
pnpm exec atom-registry scaffold --id acme/widget --out ./my-widget
# edit bundle/index.html and manifest.json
pnpm exec atom-registry publish --registry-dir ./registry --module-dir ./my-widget --bundle-base ./public
pnpm exec atom-registry verify --registry-dir ./registry --bundle-base ./public
```

Deploy `./public` (or your static host) so `bundleUrl` paths resolve. For the reference registry, open a PR to `Qwixl/Atom` under `apps/shell/public/registry/` or host your own index and point shells at it in Settings.

## Reference registry — prohibited use (M-TS-01)

The curated store at [atom.registry.qwixl.com](https://atom.registry.qwixl.com) rejects modules whose primary purpose is:

- Malware, credential theft, or sandbox escape attempts
- Illegal goods or services (weapons, drugs, commercial sex)
- Terrorist facilitation or violent extremism
- CSAM or sexual abuse material

Third-party registries are owner-controlled; Atom cannot centrally block them. Owners who add a custom index accept responsibility for what they install. Report abuse on the reference store via the project security contact in [SECURITY.md](./SECURITY.md).

PRs to the reference registry must pass `pnpm registry:verify --require-integrity --signatures` in CI. Duplicate `id@version` rows in `index.json` fail verification.

## Scaffold

```bash
atom-registry scaffold --id <namespace>/<name> --out <dir> [--publisher did:key:...]
```

Creates:

```
<dir>/
  manifest.json      # module metadata (v1 schema)
  bundle/index.html  # iframe bundle starter
  README.md          # module-local notes
```

## Manifest rules (v1)

- `capabilities` must be `[]`.
- `bundleUrl` is relative to your static host root (e.g. `/modules/acme-widget/index.html`).
- `components[].events` lists every outbound postMessage event name.
- Run `atom-registry publish` to compute `bundleIntegrity`, copy `pricing` to `index.json`, and update the index entry.
- **`tier: "system"`** — first-party core modules (coordination defaults). Always installed on reference registry; excluded from ratings; not user-uninstallable. Community modules compete on ratings in `ratings.json`.

## Paid listings (M8 store)

Optional `pricing` on `manifest.json` and mirrored on the index entry:

```json
{
  "pricing": {
    "model": "paid",
    "priceCents": 499,
    "currency": "USD",
    "purchaseUrl": "https://your-store.example/checkout/widget"
  }
}
```

Omit `pricing` or set `"model": "free"` for free modules. During beta, paid modules still install in the reference shell (see `05-economics/02-revenue-model.md`). Target rev share when billing ships: ~15% (Q13).

Governance of the default curated store: `06-decisions-log.md#d029`.

## iframe bridge

1. On load, post `{ type: "ready" }` to the shell (handshake).
2. Listen for `{ type: "init", props, theme }` from the shell; record `event.origin` as the reply target.
3. Emit `{ type: "event", name: "<declared>", payload: {...} }` with `postMessage(..., shellOrigin)`.

See [API-v1.md](./API-v1.md#module-sandbox-web-v1) for the full sandbox contract.

## CLI reference

| Command | Purpose |
|---|---|
| `atom-registry scaffold` | Create module from template |
| `atom-registry hash <file>` | sha256 integrity string |
| `atom-registry verify` | Check index + manifest + bundle hashes |
| `atom-registry publish` | Update integrity fields + index entry |
| `atom-registry publish-all` | Recompute hashes for every manifest under a registry tree (monorepo helper) |

## Monorepo: `publish-all`

In this repo, after editing any module under `apps/shell/public/registry/`:

```bash
pnpm registry:publish-all
pnpm registry:verify
```

`publish-all` walks every `manifest.json`, writes `bundleIntegrity` into the manifest, and **upserts** the matching `id@version` row in `index.json`. It does **not** remove older semver rows. `atom-registry verify` fails on duplicate `id@version` rows (M-TS-09).

When you **supersede** a module in place (same `manifest.json` path, bumped `version` in the manifest):

1. Run `publish-all` (or `publish` for that module only).
2. **Remove** stale index entries whose `version` no longer matches the manifest on disk — otherwise CI fails with `manifest integrity mismatch` (two index rows pointing at one manifest file).
3. Open a PR; CI runs `registry:verify --require-integrity --signatures`.

External developers hosting their own registry only run `publish` on their module; they never need `publish-all` unless they maintain a multi-module index themselves.

## Example module

Reference: [`apps/shell/public/registry/travel/seat-map/`](./apps/shell/public/registry/travel/seat-map/) and bundle at [`apps/shell/public/modules/travel-seat-map/`](./apps/shell/public/modules/travel-seat-map/).
