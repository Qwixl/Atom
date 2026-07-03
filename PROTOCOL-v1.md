# Atom protocol v1 (data objects + identity)

**Status:** frozen as of `@qwixl/protocol@0.1.0`. Breaking changes require major semver and a migration note.

Decisions: `06-decisions-log.md#d022` (did:key), `#d024` (governance), `#d023`/`#d025` (MLS E2E on agent backend).

## Data object (`DataObject`, v1)

Four layers per `03-protocol/00-data-object.md`:

1. **Cryptographic envelope** — `issuerDid`, `signature`, `signatureAlgorithm`
2. **Semantic tag** — `semantic.schema` (+ optional `version`, `embeddingHint`)
3. **Payload** — minimal key/value slice (`payload`)
4. **Governance** — `governance.purpose`, optional `ttlSeconds` or `expiresAt`

```ts
interface DataObject {
  version: 1;
  id: string;                 // UUID
  issuerDid: string;          // did:key:… (Ed25519)
  issuedAt: string;           // ISO 8601
  semantic: { schema: string; version?: string; embeddingHint?: string };
  payload: Record<string, unknown>;
  governance: { purpose: string; ttlSeconds?: number; expiresAt?: string };
  signatureAlgorithm: "ed25519";
  signature: string;          // base64
}
```

Validation: `validateDataObject()` in `@qwixl/protocol`.  
Verification: `verifyDataObject(input, { allowedPurposes?, now? })` — shape, Ed25519 signature, expiry, and purpose policy (receiver-side, D024).

Signing: `signDataObject(body, keyPair)` after `generateAgentKeyPair()`.

## Identity (did:key)

- Agents generate Ed25519 keypairs; DID is `did:key:` + multibase base58btc-encoded `0xed 0x01 || publicKey`.
- v1 supports **did:key only**. Verification extracts the public key from the DID string (no HTTP DID resolution).
- Module manifest `publisher` fields SHOULD use the same DID format.

## Governance enforcement (v1)

| Rule | Enforced by |
|---|---|
| Purpose binding | Receiver `allowedPurposes` in `verifyDataObject()` |
| TTL / expiry | Receiver rejects expired objects (`ttlSeconds` from `issuedAt`, or `expiresAt`) |
| Cryptographic purpose-binding | **Not in v1** — see `07-open-questions.md#q7` |

## E2E encryption (agent ↔ agent)

- **MLS (RFC 9420)** on the owner-controlled **agent backend** (`@qwixl/mls-session`, ts-mls per D025).
- MLS wire bytes travel in A2A `data` parts as `{ mediaType: "application/vnd.atom.mls-wire+cbor;version=1", wire: "<base64>" }` (`@qwixl/a2a-transport`).
- Ciphertext is exchanged over **A2A** transport; the shell never holds MLS epoch secrets (D017, D023).
- Plaintext data objects are verified with `verifyDataObject()` after MLS decryption on the backend.
- Pair session API: `establishPairSession()`, `MlsPairSession.encrypt()` / `.decrypt()`. Process restart persistence deferred (D025).

## Embedding fallback

When `semantic.schema` is unknown, hosts MAY use vector similarity against `embeddingHint` — rendering and policy remain host-owned. No wire-format change in v1.

## A2A transport (agent ↔ agent)

- Signed `DataObject` payloads travel in A2A `data` parts as `{ mediaType, object }` (`@qwixl/a2a-transport`).
- Reference agent backend: `pnpm dev:a2a` → `http://127.0.0.1:5204` (JSON-RPC at `/a2a/jsonrpc`, admin at `/inbox`, `/send`).
- Verification on receive: `verifyMessageDataObjects()` with purpose allowlist.
- MLS wire parts: `mlsWireToPart()` / `parseMlsWireFromPart()` for encrypted payloads (handshake + application messages).
- MLS handshake: `sendMlsHandshake()` delivers Welcome + ratchet tree; `POST /mls/connect` on reference agent orchestrates pair setup.
