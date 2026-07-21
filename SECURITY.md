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
5. Sigstore bundle shape + in-toto subject digest match when `signatureUrl` present (required on production)
6. Bundle bytes match `bundleIntegrity`
7. `syncRevocations()` evicts installed modules when list updates

Optional owner policy (self-hosted / dev Settings only):

| Field | Effect |
|---|---|
| `requireSignature` | Refuse install when manifest has no valid Sigstore bundle |
| `trustedPublishers` | Allowlist of publisher DIDs; manifests from other publishers are rejected |
| `blockedIds` | Owner denylist of module ids (also editable in Settings → Registry) |

Curated-store CI (`pnpm registry:verify`) requires publisher DIDs on the allowlist and a valid `signatureUrl` (digest-anchored Sigstore shape) on every listing; `registry:verify:strict` adds Fulcio/Rekor crypto (`--fulcio`). Precedent: npm `only-allow` publisher allowlists + browser extension store curation.

## Custom agent / SLM posture (M-TS-06)

Self-host and local-SLM owners choose their own model; Atom does not claim token-level filtering of every reply. Hosted fleet may set:

| Env | Effect |
|---|---|
| `ATOM_SAFETY_PREFIX` | Prepended to AG-UI system prompt |
| `ATOM_MODEL_ALLOWLIST` | Comma-separated model ids; rejects turns outside the list |

Shell chrome (catalog composition, consequential approval, D031 quarantine) remains the structural backstop. Full note: `docs/04-security/07-custom-agent-slm-posture.md` (private working tree).

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
| Chat / connector blast radius | Short-lived session bearers (`owner:runtime`, `chat:agui`, `connector:read`); hosted connect returns `sessionToken` only — root admin stays in control-plane secrets | Optional httpOnly BFF if still required |

**Operator rule:** treat `ATOM_ADMIN_TOKEN` and signup responses like production root credentials. Rotate on compromise via re-provision or export→self-host.

## Hosted control plane (production)

Qwixl’s production control plane and Docker fleet run in the private **Atom-MC** repo (`Qwixl/Atom-MC`), not from this Apache-2.0 tree. This repo’s `apps/control-plane` is a **local stub** for `pnpm dev:hosting` only (no Docker provisioner).

| Env (Atom-MC / production) | Purpose |
|---|---|
| `ATOM_FLEET_MODE=docker` | Per-owner agent containers (Atom-MC only) |
| `ATOM_FLEET_PUBLIC_URL_TEMPLATE` | **Required** in production — prefer `https://{handle}.agents.example.com` (D098); `{port}` transitional |
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

**Abuse / LE contact (curated store & hosted fleet):**

| Channel | Use |
|---|---|
| Settings → Registry / Messages → **Report** | Queued control-plane intake (`/module-abuse-report`, `/comms-abuse-report`) |
| Email | `abuse@qwixl.dev` (same as AUP) |
| GitHub | Security advisories for vulnerability reports |

**SLA (curated reference registry / managed hosting):** `csam` and malware/phishing → same-day triage goal; illegal-content / scam → within a few business days; spam/other → best-effort queue. Federated third-party indexes remain owner-controlled — Atom cannot globally revoke them (Q23). Law-enforcement requests against hosted agents: metadata + suspend history only (no MLS plaintext).

**Module / registry abuse (M-TS-04):** owners can **Report** a catalog listing from Settings → Registry. Control plane logs `POST /module-abuse-report`. Operators follow `docs/04-security/06-registry-revocation-runbook.md` (update `revocations.json`, redeploy; shells evict via `syncRevocations()`).

**Comms / contact abuse (M-TS-08):** Messages → Contact → **Report** (or room member menu). Control plane logs `POST /comms-abuse-report` (metadata only — no MLS plaintext). Block/Mute already enforced on agent backends. Operators follow `docs/04-security/08-comms-abuse-runbook.md`; hosted peers may escalate to suspend.

**Module ratings (M-TS-11):** Settings → Registry stars from `ratings.json`; `POST /module-feedback` queues curator updates — see `docs/04-security/09-module-ratings-feedback-runbook.md`.

**Sigstore (M-TS-03):** CI `pnpm registry:verify` requires `signatureUrl` on every curated listing (digest-anchored DSSE via `atom-registry sign` / `pnpm registry:sign-all`). Fulcio/Rekor keyless signing: `atom-registry sign --fulcio` (OIDC / `SIGSTORE_ID_TOKEN` / GitHub Actions `id-token`) and weekly smoke `.github/workflows/registry-fulcio-smoke.yml`. `registry:verify:strict` / `--fulcio` verify crypto when bundles are Fulcio-signed.

## References

- [SECRET-STORE.md](./SECRET-STORE.md)
- [API-v1.md](./API-v1.md)
