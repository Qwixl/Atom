# Secret storage (v1)

How embedders wire credential storage for LLM keys and other secrets. The reference shell uses `@qwixl/secret-store` (**monorepo-only** — not on npm; see D030 in private decisions log). Production hosts should implement the same `SecretStore` interface against an OS-backed vault. Publish to npm later only if embedders need installable dev helpers.

## Adapter priority (D027)

| Priority | Backend | When to use |
|---|---|---|
| 1 | **Agent-backend proxy** | Browser production — AG-UI to `@qwixl/agent-backend` with `LLM_API_KEY` on the server (see [AGENT-BACKEND.md](./AGENT-BACKEND.md)) |
| 2 | **`localStorage`** | Browser dev / reference shell only — not for production secrets |
| 3 | **Host `SecretStore`** | Embedders — OS keychain, passkey-protected vault via `window.__QWIXL_SECRET_STORE__` or `createDefaultSecretStore({ host })` |
| 4 | **Browser extension + native messaging** | Deferred — desktop shell (Tauri/Electron), not Phase 1 |

| — | **`memory`** | Tests, ephemeral sessions, CI |

### Default factory

```ts
import { createDefaultSecretStore } from "@qwixl/secret-store";

const secretStore = createDefaultSecretStore();
// or inject a host backend:
const secretStore = createDefaultSecretStore({ host: myKeychainAdapter });
```

`createDefaultSecretStore()` resolves:

1. `options.host`, or `window.__QWIXL_SECRET_STORE__` when set by the embedder
2. `localStorage` in the browser, otherwise in-memory

Reads from the host layer override persisted values; writes go to the persistent layer (`localStorage` or memory).

### Layered stores

```ts
import { createLayeredSecretStore, createMemorySecretStore } from "@qwixl/secret-store";

const store = createLayeredSecretStore(
  createMemorySecretStore(), // primary (writes)
  hostKeychain,              // overlay (reads first)
);
```

## LLM connection pattern (D017)

Connection metadata (base URL, model) is stored separately from the API key:

```ts
import {
  DEFAULT_LLM_SECRET_REF,
  loadAndMigrateLlmConnection,
  persistLlmConnection,
  resolveLlmConfig,
} from "@qwixl/secret-store";

const connection = loadAndMigrateLlmConnection(secretStore);
const runtime = connection ? resolveLlmConfig(connection, secretStore) : null;
```

Legacy inline `apiKey` fields in stored JSON are migrated into `SecretStore` on first load.

### Production hosts

- Use `createProductionSecretStore()` — session memory only; inject `host` for OS-backed vaults.
- Deployed shell purges legacy `localStorage` credentials on startup.
- Browser-direct LLM is disabled on production builds; use AG-UI or a server-side agent.

### Local development

- `createDefaultSecretStore()` may use `localStorage` for dev convenience.
- Inject `host` or set `window.__QWIXL_SECRET_STORE__` before the shell mounts for integration tests.
- Use `memory` backend in unit tests; pass seeded values via `memorySeed`.

## References

- [API-v1.md](./API-v1.md) — session and host contracts
- [SECURITY.md](./SECURITY.md) — threat model for shipped surface
