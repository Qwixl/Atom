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
- MLS wire bytes travel in A2A `data` parts with `mediaType` `application/vnd.atom.mls-wire+cbor;version=1`, carried both on the part and in the envelope `{ mediaType, wire: "<base64>", senderDid? }` (`@qwixl/a2a-transport`) — see [Part encoding (A2A v1.0)](#part-encoding-a2a-v10).
- Ciphertext is exchanged over **A2A** transport; the shell never holds MLS epoch secrets (D017, D023).
- Plaintext data objects are verified with `verifyDataObject()` after MLS decryption on the backend.
- Pair session API: `establishPairSession()`, `MlsPairSession.encrypt()` / `.decrypt()`. Process restart persistence deferred (D025).

## Embedding fallback

When `semantic.schema` is unknown, hosts MAY use vector similarity against `embeddingHint` — rendering and policy remain host-owned. No wire-format change in v1.

## A2A transport (agent ↔ agent)

**Protocol version:** A2A **v1.0** (spec GA 2026-07-22, `@a2a-js/sdk@1.0.0`). v0.3 peers remain supported through the SDK's opt-in compat layer, enabled on both sides — see [Protocol version and v0.3 compatibility](#protocol-version-and-v03-compatibility).

- Signed `DataObject` payloads travel in A2A `data` parts with `mediaType` `application/vnd.atom.data-object+json;version=1`, carried both on the part and in the envelope `{ mediaType, object }` (`@qwixl/a2a-transport`).
- Reference agent backend: `pnpm start:agent` or `npx @qwixl/agent-backend` → `http://127.0.0.1:5204` (JSON-RPC at `/a2a/jsonrpc`, admin at `/inbox`, `/send`). See [AGENT-BACKEND.md](./AGENT-BACKEND.md).
- Verification on receive: `verifyMessageDataObjects()` with purpose allowlist.
- MLS wire parts: `mlsWireToPart()` / `parseMlsWireFromPart()` for encrypted payloads (handshake + application messages).
- MLS handshake: `sendMlsHandshake()` delivers Welcome + ratchet tree; `POST /mls/connect` on reference agent orchestrates pair setup.

### Part encoding (A2A v1.0)

A `Part` is no longer discriminated by `kind`. It is protobuf-generated: `{ content: { $case: "text" | "data" | "raw" | "url", value }, mediaType, filename, metadata }`. `mediaType` is now a **first-class field on the part**; under v0.3 there was nowhere to put it, so Atom carried it as a key inside the payload envelope.

```json
{
  "content": {
    "$case": "data",
    "value": { "mediaType": "application/vnd.atom.data-object+json;version=1", "object": { "…": "DataObject" } }
  },
  "mediaType": "application/vnd.atom.data-object+json;version=1",
  "filename": ""
}
```

**Decision:** Atom writes the media type in **both** places and reads it from **either**, preferring the native field. Routes rejected: the **native field only** — cleanest wire, but breaks peers and modules that read the envelope key; the **envelope key only** — leaves Atom parts opaque to generic A2A tooling. The duplication is deliberate and temporary; the envelope key can be dropped in a later release once no peer reads it. Codec: `toAtomDataPart()` / `readAtomDataPart()`.

Messages: `Message` lost its `kind` discriminator; `role` is the `Role` enum (`ROLE_USER` / `ROLE_AGENT`) rather than `"user"` / `"agent"`; `contextId` and `taskId` are plain strings (empty string, not `undefined`, when absent); `extensions: string[]` and `referenceTaskIds: string[]` are new. Every outgoing Atom message declares `https://atom.qwixl.dev/a2a/data-object/v1` in `extensions` — the v1.0 mechanism for signalling which protocol extensions a message relies on (`atomMessage()`).

### Agent card (A2A v1.0)

The v1.0 card has **no** top-level `url` and **no** top-level `protocolVersion`. Both moved into `supportedInterfaces: AgentInterface[]`, an ordered list of `{ url, protocolBinding, protocolVersion, tenant }` whose **first entry is preferred**; `additionalInterfaces` is gone. `security` became `securityRequirements`. Skills now require `examples`, `inputModes`, `outputModes`, `securityRequirements`; card extensions now require a `description`; `signatures: AgentCardSignature[]` is new.

- `buildAtomAgentCard()` emits **two** interfaces on the same `/a2a/jsonrpc` URL — v1.0 first, then v0.3 — so a peer on either version finds an interface it can use.
- `agentCardUrl(card)` reads the preferred interface URL, replacing reads of `card.url`. `rebindAtomAgentCard(card, baseUrl)` repoints all interfaces; `atomJsonRpcUrl(baseUrl)` builds the path.
- Cards MAY be signed (JWS). `signAtomAgentCard()` signs with the agent's `did:key` using `alg: EdDSA` and `kid` set to the DID itself, so a verifier resolves the public key out of the DID — no key server, no JWKS endpoint, no second network request. `verifyAtomAgentCard(card)` returns the signing DID.
- Implementation note: the SDK's sign and verify paths are not symmetric — signing canonicalizes the card as given, verification round-trips through `AgentCard.fromJSON` / `toJSON` first. Atom normalises through the same round-trip before signing so both sides hash identical bytes.

### Protocol version and v0.3 compatibility

| v0.3 | v1.0 |
|---|---|
| `message/send` | `SendMessage` (JSON-RPC method names are PascalCase) |
| `X-A2A-Extensions` | `A2A-Extensions` |
| — | `A2A-Version`; **absent defaults to `0.3`** |

- **Server:** `createAtomA2aExpressApp` passes `legacyCompat: { enabled: true }` to both the agent-card handler and the JSON-RPC handler. One `/a2a/jsonrpc` endpoint serves both versions, dispatching on `A2A-Version`; the card handler returns a v0.3-shaped card to legacy requests and the v1.0 card otherwise.
- **Client:** `createAtomPeerClient(peerUrl)` configures compat on the card resolver **and** the JSON-RPC transport factory. These must agree: the resolver stamps `protocolVersion: '0.3'` on interfaces it synthesizes from a v0.3 card, and the transport factory reads that stamp to pick the v0.3 transport. An upgraded agent therefore speaks v1.0 to upgraded peers and v0.3 to everyone else, decided per peer from that peer's own card.
- **Proven, not asserted:** `packages/a2a-transport/src/compat.integration.test.ts` runs a genuine v0.3 server built from the real `@a2a-js/sdk@0.3.14` (installed alongside v1.0 under the alias `@a2a-js/sdk-v03`) and exercises both directions — a v1.0 Atom client delivering to a v0.3 peer, and a real v0.3 client delivering to an upgraded v1.0 Atom agent.
- **Deployment order:** every peer's **server** must be upgraded to v1.0-with-compat **before** any client starts speaking v1.0. Servers accept both; clients negotiate down. The reverse order breaks delivery.

## First contact (online invitations)

- Online first contact uses **signed invitation tokens** (DIDComm v2 Out-of-Band pattern).
- An invitation is a signed data object: schema `https://atom.qwixl.dev/schema/ContactInvite`, purpose `contact:invite`, TTL (default 7 days), payload `{ endpoint, name? }`.
- Token encoding: base64url of the JSON object — shareable over any channel (link, email, DM, QR).
- Verification (`verifyContactInvite`): Ed25519 signature + TTL + purpose via `verifyDataObject()`; endpoint must be http(s).
- On connect via invite, the peer's reported DID **must** match the invite's `issuerDid` (mismatch aborts the MLS handshake).
- API: `createContactInvite()` / `verifyContactInvite()` in `@qwixl/a2a-transport`; reference agent `POST /invite` and `POST /mls/connect { invite }`.
- A published agent card (`/.well-known/agent-card.json`) acts as an implicit invitation for agents opting into public reachability (Aries RFC 0434 precedent).
