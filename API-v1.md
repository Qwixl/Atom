# Atom platform API v1 (frozen)

**Status:** frozen as of platform v0.1.0. Breaking changes to these contracts require a major semver bump and a migration note.

Consumers: embedders (`@qwixl/shell-core`, `@qwixl/renderer-web`), module authors, agent transport adapters.

## Composition (`Composition`, v1)

```ts
interface Composition {
  version: 1;           // literal — only 1 is valid in v1
  surfaceId: string;    // non-empty, stable for the surface lifetime
  intent?: string;      // human-readable purpose for chrome
  root: CompositionNode;
}

interface CompositionNode {
  id: string;           // unique within surface
  component: string;    // "core/text" | "namespace/name@major"
  semanticRole?: string;
  props?: JsonObject;
  children?: CompositionNode[];
  events?: string[];    // declared outbound event names
}
```

Validation: `validateComposition()` in `@qwixl/shell-core`. Invalid compositions are rejected at the transport boundary.

## Agent session (`AgentSession`)

Inbound (host → agent):

| Method | Purpose |
|---|---|
| `sendUserMessage(text)` | User typed in composer |
| `sendUiEvent(event)` | Module/core interaction |
| `sendActionDecision(id, approved\|declined)` | Shell chrome outcome |
| `sendDataDisclosure?(requestId, decision, records)` | Guarded data approval |

Outbound (`AgentOutput`, agent → host):

| `type` | Payload |
|---|---|
| `text` | `{ text }` |
| `composition` | `{ composition }` |
| `consequential-action` | `{ surfaceId, action }` |
| `data-request` | `{ request }` |
| `done` | — |

Wire parsing: `parseAgentProtocolMessage()` (LLM JSON) and AG-UI CUSTOM events (`@qwixl/ag-ui-adapter`).

## Consequential actions (`ConsequentialAction`)

```ts
interface ConsequentialAction {
  id: string;
  kind: "confirmation" | "payment" | "permission";
  title: string;
  terms: JsonObject;    // chrome displays this, not module UI
  confirmLabel?: string;
  declineLabel?: string;
}
```

Modules and composition nodes **must not** render these. Host-owned chrome only (D010).

## Module manifest (v1)

Required fields:

| Field | Rule |
|---|---|
| `id` | `namespace/name` slug |
| `version` | semver string |
| `publisher` | DID string |
| `bundleUrl` | URL or site-root path to iframe HTML bundle |
| `targets` | `["web"]` for v1 |
| `components` | ≥1 entry with `name`, `semanticRole`, `events` |
| `capabilities` | **must be `[]`** in v1 (pure renderers) |
| `bundleIntegrity` | `sha256:<hex>` — set by `atom-registry publish` |

Optional: `signatureUrl` (Sigstore bundle JSON). Runtime verifies bundle structure and that the in-toto statement subject digest matches manifest bytes; use `atom-registry verify --signatures` at publish time. Full Rekor/x509 verification is deferred.

## Revocations

Registry index may include `revocationsUrl` pointing at:

```ts
interface RegistryRevocations {
  revocationsVersion: 1;
  revoked: Array<{ id: string; version: string; reason?: string; revokedAt?: string }>;
}
```

`version: "*"` revokes all versions of an id. `ModuleRegistry` refuses install for revoked entries and exposes `syncRevocations(catalog)` to evict already-installed modules when the list updates.

## Secret storage

Hosts resolve LLM and other credentials via the `SecretStore` interface. Adapter priority: host inject → `localStorage` (dev) → memory. See [SECRET-STORE.md](./SECRET-STORE.md).

## Module sandbox (web v1)

- iframe with `sandbox="allow-scripts allow-same-origin"`.
- Props in via URL hash `#init=<json>` and optional `{ type: "init", props, theme }` postMessage.
- Module signals `{ type: "ready" }` when loaded.
- Outbound events: `{ type: "event", name, payload }` — `name` must be declared in manifest.
- No network, storage, navigation, or sensors from module code.

## Registry index (v1)

```ts
interface RegistryIndex {
  registryVersion: 1;
  modules: RegistryModuleEntry[];
  updatedAt: string;
  revocationsUrl?: string;
}
```

Each entry carries `manifestUrl`, `integrity`, `bundleIntegrity`, `publisher`. Verify with `atom-registry verify` or `ModuleRegistry` at install time.

## Core primitives (v1)

Registered by `registerCorePrimitives()`: `core/text`, `core/heading`, `core/image`, `core/list`, `core/table`, `core/card`, `core/choice`, `core/form`, `core/text-field`, `core/action`, `core/status`, `core/progress`, `core/chart`, `core/stack`, `core/disclosure`.

`core/choice` modes (D011): standalone → immediate `selected`; inside `core/form` → collected on `submitted`.

## Semver policy

| Change | Bump |
|---|---|
| Add optional field, new core primitive, new non-breaking manifest field | minor |
| Remove/rename field, change validation rules, change sandbox bridge | **major** |
| Linked packages bump together via changesets |

## References

- Embed guide: [EMBED.md](./EMBED.md)
- Module author guide: [MODULES.md](./MODULES.md)
- Contract tests: `packages/shell-core/src/contracts.test.ts`
