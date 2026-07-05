# Security model (shipped surface)

Production deployments (`atom.qwixl.com`, npm `@qwixl/*`) are treated as production environments. This document describes controls and residual risks.

## Trust boundaries

```text
┌─────────────────────────────────────────────────────────┐
│  Owner-controlled shell (your host)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Catalog +   │  │ Shell chrome │  │ OwnerStore +    │ │
│  │ resolver    │  │ (confirm,    │  │ attestation log │ │
│  │             │  │  data req)   │  │ (local)         │ │
│  └──────┬──────┘  └──────────────┘  └─────────────────┘ │
│         │ cross-origin iframe (sandbox: allow-scripts)  │
│  ┌──────▼──────┐                                         │
│  │ Module      │  no parent DOM / storage access         │
│  │ bundles     │  (separate registry origin in prod)    │
│  └─────────────┘                                         │
└─────────────────────────────────────────────────────────┘
```

## Production shell controls

| Control | Implementation |
|---|---|
| Module isolation | `sandbox="allow-scripts"` only — **no** `allow-same-origin` |
| Cross-origin modules | Registry pinned to `https://atom.registry.qwixl.com` |
| Init bridge | Props via `postMessage` with origin validation — not URL hash |
| CSP + HSTS | `apps/shell/vercel.json` security headers |
| Browser LLM keys | **Disabled** on `import.meta.env.PROD` builds |
| Secrets | Session memory only (`createProductionSecretStore`); legacy `localStorage` credentials purged on startup |
| Connector custody | Encrypted agent vault for connector secrets (e.g. WebCal feed URLs); shell never receives raw feed URLs after save; passkey required for consequential approvals (WebAuthn); owner store + attestations sync to backend when agent connected |
| Registry trust | Integrity required; URL/policy not user-editable in production |
| Curator auto-accept | Default **off** |
| Agent images | `core/image` accepts **https** public URLs only |

## Registry install checks (runtime)

1. Index entry exists and semver matches
2. Not on revocation list
3. Manifest bytes match index `integrity`
4. Owner trust policy (`requireIntegrity` default **true**)
5. Sigstore bundle digest match when `signatureUrl` present
6. Bundle bytes match `bundleIntegrity`
7. `syncRevocations()` evicts installed modules when list updates

## Module sandbox (web v1)

- iframe `sandbox="allow-scripts"` — opaque origin; cannot read parent `localStorage`
- Init: shell sends `{ type: "init", props }` after `{ type: "ready" }` from module
- Outbound events validated against manifest `events` list
- Modules hosted on registry origin in production (cross-origin from shell)

## Secret storage

| Priority | Backend | Production |
|---|---|---|
| 1 | Host `SecretStore` / `window.__QWIXL_SECRET_STORE__` | Recommended for embedders |
| 2 | Memory (session) | **Default on deployed shell** |
| 3 | localStorage | **Dev only** — never for API keys in production |

LLM connection metadata on production uses `sessionStorage` (tab-scoped); keys stay in memory.

## AG-UI reference server

- Binds `127.0.0.1` by default
- CORS limited to localhost shell/embed origins
- **Not deployed** — do not expose without authentication

## Residual risks

| Risk | Mitigation path |
|---|---|
| Sigstore browser install check | Digest + DSSE statement match; full Rekor/x509 at registry ingress (`atom-registry verify --signatures`, enforced in CI/deploy) |
| Public registry CORS `*` | Client trust policy; optional origin allowlist for private registries |
| Agent prompt injection | Composition validation + catalog-only resolution; user confirms consequential actions |
| XSS in shell bundle | CSP, dependency audit, no `dangerouslySetInnerHTML` |
| Hosted signup / fleet abuse | M21.2 rate limits + `/provision` lockdown on control plane |
| Plain HTTP or localhost agent URLs in production | M21.3 fleet HTTPS invariants; shell `productionGuard.ts` blocks localhost fetches |
| Admin bearer token in browser | High blast radius if XSS/phishing; M21.4 documents rotation/proxy path |
| Public open rooms | Intentional exposure; M21.5 defaults new rooms to `invite` |
| Untrusted AG-UI backends | M21.6 production warn/block for non-HTTPS endpoints |

## Admin bearer token (hosted agents)

Each hosted agent receives a bearer token at signup. It is equivalent to **root access on that owner's agent** (inbox, MLS, connectors, export, business data).

| Threat | Control today | Planned (M21.4) |
|---|---|---|
| XSS on shell origin | CSP, no `dangerouslySetInnerHTML`, dependency review | Periodic audit (M21.9) |
| Phishing ("paste your token") | User-facing copy avoids exposing token after setup | — |
| Token in browser storage | Encrypted vault after passkey setup; session-scoped LLM metadata only | Optional control-plane proxy with httpOnly session |
| Leaked signup JSON | Same-origin only; XSS is the main path | Rate limits on signup (M21.2) |

**Operator rule:** treat `ATOM_ADMIN_TOKEN` and signup responses like production root credentials. Rotate on compromise via re-provision or export→self-host.

## Hosted control plane (production)

| Env | Purpose |
|---|---|
| `ATOM_FLEET_MODE=docker` | Per-owner agent containers |
| `ATOM_FLEET_PUBLIC_URL_TEMPLATE` | **Required** in production — HTTPS template, e.g. `https://{port}.agents.example.com` |
| `ATOM_PROVISION_SECRET` | When set, `/provision` requires `Authorization: Bearer` (disabled in production when unset) |
| `ATOM_SHELL_ORIGINS` | CORS allowlist for shell origins |
| `NODE_ENV=production` | Enables fleet HTTPS invariants and provision lockdown |

Rate limits (M21.2): `/signup` 5 per 15 min per IP; `/handles/check` 30 per min per IP.

## Registry publisher hygiene (M21.7)

- Sigstore signing keys and npm publish tokens live in CI secrets only — never in the repo.
- Run `pnpm registry:verify --require-integrity --signatures` before registry deploy.
- Compromise of publisher keys is the supply-chain threat integrity hashes cannot fix alone.

## Hardening queue (M21)

Hosted production hardening is tracked in the private roadmap (`docs/09-roadmap.md` § Production security hardening queue). Public operational priority: deploy production shell guards → control plane rate limits → fleet HTTPS → room admission defaults.

## Reporting

Security issues: [GitHub security advisories](https://github.com/Qwixl/Atom/security/advisories) on `Qwixl/Atom`.

## References

- [SECRET-STORE.md](./SECRET-STORE.md)
- [API-v1.md](./API-v1.md)
