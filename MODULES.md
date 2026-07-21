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

Third-party registries are owner-controlled; Atom cannot centrally block them. Owners who add a custom index accept responsibility for what they install. Report abuse on the reference store via **Settings → Registry → Report** on a catalog row (control plane intake) or the project security contact in [SECURITY.md](./SECURITY.md). Operators follow the revocation runbook under `docs/04-security/06-registry-revocation-runbook.md` (private working tree).

PRs to the reference registry must pass `pnpm registry:verify` in CI (`--require-integrity --signatures --require-signatures --require-publisher` + trusted publisher allowlist + bundle scan). Duplicate `id@version` rows in `index.json` fail verification. Soft CI remains available as `pnpm registry:verify:soft`.

**Publisher identity (M-TS-03):** every curated listing must declare a `publisher` DID; CI allowlists reference DIDs (`did:key:z6Mkatomexamples01`, plus curated demos such as `did:key:z6Mkdemotravel0001`). Listings must include `signatureUrl` (Sigstore-shaped DSSE beside the manifest). Sign with `pnpm registry:sign-all` (or `atom-registry sign --module-dir …`) after publish — digests stay stable because `signatureUrl` mirrors on the **index**, not the manifest. CI `pnpm registry:verify` **requires** signatures (shape + in-toto subject digest). Fulcio/Rekor crypto is optional: `pnpm registry:verify:strict` (`--fulcio`).

## Dating modules (BK-38 / M-ECO-12)

Dating is a **registry category only** — not shell core. First-party `dating/intro` is a one-shot intro card (display name, one-liner, optional tags) with peer **Accept / Pass**. Modules must not collect phone, email, or other contact details in the iframe; adding a contact stays in shell chrome. Matching, photos, geo, and KYC are out of scope for this module.

## Commerce modules (M-TS-05)

The reference registry rejects commerce modules whose primary purpose is:

- Regulated goods without required licensing (firearms, prescription drugs, alcohol where prohibited)
- Illegal services (see prohibited-use list above)
- Deceptive pricing or hidden subscription traps in module UI

Commerce modules must use shell consequential-action chrome for payment authorization; modules must not collect card data in the iframe sandbox.

## Registry trust policy (M-TS-10)

Self-hosted shells may configure trust when loading a custom registry index:

| Policy field | Default | Effect |
|---|---|---|
| `requireIntegrity` | `true` | Refuse install when index/manifest hashes missing or mismatched |
| `requireSignature` | `true` on production | Refuse install when index/manifest omits `signatureUrl` or Sigstore digest fails |
| `trustedPublishers` | reference + curated demo DIDs on production | When set, only manifests whose `publisher` DID is in the list may install |
| `blockedIds` | unset | Owner denylist of module ids (Settings → Registry) |

Production shell (`atom.qwixl.com`) pins the reference registry and does not expose custom index URLs. It sets `trustedPublishers` + `requireSignature: true`. Enterprise embedders set policy via host config — see [SECURITY.md](./SECURITY.md) § Registry install checks.

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
- Run `atom-registry publish` to compute `bundleIntegrity`, copy `pricing` / `categories` / `tier` to `index.json`, and update the index entry.
- **`categories`** — mirrored onto the index for Settings catalog filters (namespace ∪ tags). Verification fails if index and manifest categories diverge.
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

Omit `pricing` or set `"model": "free"` for free modules. Paid distribution for Atom owners is via the commercial **Atom App Store** (`https://atom.apps.qwixl.com`): developer is merchant of record (Stripe Connect); store take is **15% application fee** on paid Checkout (D103 / Atom-Apps A010). Package and publish from the store console — see [Atom Apps publish docs](https://atom.apps.qwixl.com/docs/publish).

Governance of the open registry protocol: `06-decisions-log.md#d029`. Default commercial host: `#d071` / `#d099`.

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
