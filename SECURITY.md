# Security model (shipped surface)

Summary of the v1 threat model for the published `@qwixl/*` packages and reference hosts. Full internal analysis lives in the private docs tree.

## Trust boundaries

```text
┌─────────────────────────────────────────────────────────┐
│  Owner-controlled shell (your host)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Catalog +   │  │ Shell chrome │  │ OwnerStore +    │ │
│  │ resolver    │  │ (confirm,    │  │ attestation log │ │
│  │             │  │  data req)   │  │ (local)         │ │
│  └──────┬──────┘  └──────────────┘  └─────────────────┘ │
│         │ iframe sandbox                                 │
│  ┌──────▼──────┐                                         │
│  │ Module      │  no network / storage / navigation      │
│  │ bundles     │                                         │
│  └─────────────┘                                         │
└─────────────────────────────────────────────────────────┘
         ▲                          ▲
         │ compositions             │ agent transport
         │ (declarative)            │ (mock / AG-UI / LLM)
    Agent session              External agent / model
```

## Assets and controls

| Asset | Risk | v1 control |
|---|---|---|
| Module bundles | Malicious code in iframe | Sandbox `allow-scripts allow-same-origin`; no extra capabilities in v1 manifests |
| Registry index | Supply-chain swap | Manifest + bundle `sha256` integrity; optional Sigstore bundle digest match; owner trust policy |
| Sigstore signatures | Forged publisher identity | Runtime: DSSE in-toto subject digest match; CLI `--signatures` for publish-time bundle check; full Rekor/x509 crypto deferred |
| Revoked modules | Continued use after recall | `revocationsUrl` list; install blocked; `syncRevocations()` evicts installed copies |
| Guarded profile records | Unapproved disclosure | Shell-owned data-request chrome; agent never receives guarded values without owner action |
| Consequential actions | Silent commits | Confirmation chrome only in shell; attestation log records displayed terms |
| LLM API keys | Exfiltration via XSS | `SecretStore` abstraction; host injects OS-backed backend in production (see [SECRET-STORE.md](./SECRET-STORE.md)) |
| Agent output | Prompt injection → bad UI | Composition validation; catalog-only resolution; semantic-role fallback |

## Registry install checks (runtime)

When `ModuleRegistry` installs a module:

1. Index entry exists and semver matches
2. Not on revocation list
3. Manifest bytes match index `integrity`
4. Manifest id/version match index entry
4. Owner trust policy (`blockedIds`, `trustedPublishers`, `requireIntegrity`, `requireSignature`)
5. Sigstore bundle (if present): valid structure + manifest digest in DSSE statement
6. Bundle bytes match `bundleIntegrity`

Embedders can tighten policy via `RegistryTrustPolicy` in settings or host config.

## Out of scope (v1)

- Module network access or capability grants
- Server-side registry signing infrastructure (static JSON + optional Sigstore bundles)
- Full Sigstore certificate/Rekor verification in the browser runtime
- Cross-device owner-store sync
- Automated curator trust scoring

## Reporting

Security issues for the public repo: open a GitHub security advisory on [Qwixl/Atom](https://github.com/Qwixl/Atom).

## References

- [API-v1.md](./API-v1.md) — frozen contracts
- [SECRET-STORE.md](./SECRET-STORE.md) — credential adapter priority
- [MODULES.md](./MODULES.md) — module author signing and publish flow
