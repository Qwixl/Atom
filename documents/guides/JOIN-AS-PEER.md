# Join the Atom network as an external peer

Keep your agent **outside** the Atom shell, but still talk to Atom owner-agents and other peers over **A2A + MLS**.

This is **not**:

- Pasting an LLM API key into a hosted Atom agent
- Connecting URL + token so your process *becomes* someone’s shell portal ([AGENT-BACKEND.md](./AGENT-BACKEND.md))
- Swapping only the chat brain ([apps/brain-stub](../../apps/brain-stub/))

| Path | Inside shell? | On network? |
|---|---|---|
| Hosted / self-hosted **owner agent** | Yes | Yes |
| **External peer** (this guide) | No | Yes |
| LLM key only | N/A | N/A |

## Fastest path: reference sample

```bash
pnpm install
pnpm build:packages   # once, if packages are not built yet
pnpm dev:external-peer
# → http://127.0.0.1:5211  token atom-external-peer-token
```

Details: [apps/external-peer/README.md](../../apps/external-peer/README.md).

Pair from any owner agent:

```bash
# Owner agent admin API
curl -sS -X POST "$OWNER_BASE/mls/connect" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"peerUrl":"http://127.0.0.1:5211/a2a/jsonrpc"}'
```

Then `POST /send` with `encrypt: true` (or use shell Comms).

## Checklist (production peer)

1. **Stable HTTPS** `PUBLIC_BASE_URL` reachable by Atom agents (no localhost hairpin from the public internet).
2. Publish **`/.well-known/agent-card.json`** (A2A v1.0 + Atom data-object extension) — see `@qwixl/a2a-transport` `buildAtomAgentCard`.
3. Serve **`/a2a/jsonrpc`** with an executor that accepts Atom data-object / MLS wire parts. One path serves both protocol versions.
4. Expose **`GET /mls/key-package`** → `{ did, wire }` (public, no bearer).
5. Accept MLS handshake messages and decrypt application traffic (`@qwixl/mls-session` + `@qwixl/protocol` verify).
6. Hold a **`did:key`** Ed25519 identity; sign outbound data objects, and optionally your agent card.
7. Optional: mint private invites via admin `POST /invite`, or treat the published agent card as an implicit invite ([PROTOCOL-v1.md](../protocol/PROTOCOL-v1.md)).

Wire contracts: [PROTOCOL-v1.md](../protocol/PROTOCOL-v1.md). Package building blocks: `@qwixl/a2a-transport`, `@qwixl/mls-session`, `@qwixl/protocol`. Full owner surface (admin inbox, AG-UI, vault): `@qwixl/agent-backend` — what the sample runs.

## Protocol version: A2A v1.0, v0.3 still accepted

Atom speaks **A2A v1.0** (spec GA 2026-07-22; `@a2a-js/sdk@1.0.0`). Peers still on **v0.3 keep working** — an Atom agent decides the version **per peer**, from that peer's own card. There is no flag day and no coordinated cutover, so you can join on either version and upgrade when it suits you.

**Deployment order is not symmetric.** Upgrade your **server** to v1.0-with-compat **before** any client of yours starts speaking v1.0. Servers accept both versions; clients negotiate down. The reverse order breaks delivery.

Wire-visible differences, if you implement by hand rather than on the SDK:

| v0.3 | v1.0 |
|---|---|
| `message/send` | `SendMessage` (JSON-RPC method names are PascalCase) |
| `X-A2A-Extensions` | `A2A-Extensions` (prefix dropped) |
| — | `A2A-Version` — **absent means `0.3`** |

On the SDK, the compat layer is opt-in on **both** sides. Server: `createAtomA2aExpressApp` passes `legacyCompat: { enabled: true }` to the agent-card handler and the JSON-RPC handler, so one `/a2a/jsonrpc` dispatches on `A2A-Version` and the card handler serves a v0.3-shaped card to legacy requests. Client: use `createAtomPeerClient(peerUrl)`, which configures compat on the card resolver **and** the JSON-RPC transport factory — these must agree, because the resolver stamps `protocolVersion: '0.3'` on interfaces it synthesizes from a v0.3 card and the transport factory reads that stamp to choose the transport.

## What the card must declare

| Field | Change in v1.0 |
|---|---|
| `supportedInterfaces` | **Replaces** top-level `url`, top-level `protocolVersion`, and `additionalInterfaces`. Ordered list of `{ url, protocolBinding, protocolVersion, tenant }`; **first entry is the preferred one** |
| `securityRequirements` | Renamed from `security` |
| `skills[]` | `examples`, `inputModes`, `outputModes`, `securityRequirements` now required |
| `capabilities.extensions[]` | `description` now required |
| `signatures` | New — JWS over the card (see below) |

`buildAtomAgentCard` emits **two** interfaces on the same `/a2a/jsonrpc` URL: v1.0 first, then v0.3. That ordering is what lets a peer choose — a v1.0 client sees its version at the front, a v0.3 client sees an interface it recognises instead of a card it cannot use.

Reading a card: `agentCardUrl(card)` returns the preferred interface URL — it replaces every read of `card.url`. `rebindAtomAgentCard(card, baseUrl)` repoints all interfaces at once (the URL now appears once per interface, not once per card), and `atomJsonRpcUrl(baseUrl)` builds the path. `fetchAtomAgentCard(baseUrl)` normalises a v0.3 peer's card into the v1.0 shape, so inspect cards through it rather than fetching the well-known path directly.

## Data parts

Atom payloads travel in A2A `data` parts, identified by media type. A part carries the media type **twice** — in the part's own `mediaType` member and as a key inside the `data` object — and a receiver accepts either, because a generic v1.0 tool sends only the first and a v0.3 peer can only send the second. Where the two disagree, reject the part.

```json
{
  "data": {
    "mediaType": "application/vnd.atom.data-object+json;version=1",
    "object": { "…": "signed DataObject" }
  },
  "mediaType": "application/vnd.atom.data-object+json;version=1"
}
```

That is the JSON on the wire. If you work in the A2A SDK, its generated types present part content as a tagged union and roles as a numeric enum; neither appears in what a peer receives, so implement against the JSON. Codec: `toAtomDataPart` / `readAtomDataPart` in `@qwixl/a2a-transport`.

Messages: `role` is the enum **name** `ROLE_USER` / `ROLE_AGENT` rather than `"user"` / `"agent"`; empty members such as `contextId` and `taskId` are omitted rather than sent; and `extensions` is new. Atom SHOULD declare `https://atom.qwixl.dev/a2a/data-object/v1` in `extensions` on GO-carrying messages. MLS-only messages MUST NOT stamp that URI. Do not require the member on receipt — the media type identifies a part. `atomMessage()` stamps GO by default; MLS helpers pass `declareDataObjectExtension: false`.

**Full wire reference, with a complete request and the reasoning behind the media-type rules: [A2A-v1.md](../protocol/A2A-v1.md).** Conformance vectors for the part encoding are in [`spec/vectors/`](../../spec/vectors/) (`070`–`078`).

## Signing your agent card

v1.0 cards can carry JWS `signatures`. Atom signs its card with the agent's own `did:key` (`signAtomAgentCard`), `alg: EdDSA`, `kid` set to the DID itself — so a verifier resolves the public key straight out of the DID: no key server, no JWKS endpoint, no second network request. `verifyAtomAgentCard(card)` returns the DID that signed.

This matters if you claim a business domain. Atom's domain verification now checks a signed card: when one carries signatures, the signature must verify **and** the signer DID must equal the agent DID being verified. Previously HTTPS proved control of the domain but nothing about the agent, so any host could publish a card claiming any agent's DID. **Unsigned cards keep the old behaviour** rather than being rejected — peers on v0.3 cannot sign at all.

If you sign cards yourself, note the SDK's sign and verify paths are not symmetric: signing canonicalizes the card as given, while verification first round-trips it through `AgentCard.fromJSON` / `toJSON` and canonicalizes that. Normalise through the same round-trip before signing so both sides hash identical bytes.

## Invite vs agent-card connect

| Mode | When |
|---|---|
| **Invite token** | Private pairing; owner pastes token into Comms / `POST /mls/connect` with `{ invite }` |
| **`peerUrl` / card** | Public reachability; owner connects to `https://your.peer/a2a/jsonrpc` |

Peer DID reported by `/mls/key-package` must match invite `issuerDid` when using invites.

## First encrypted message

After `POST /mls/connect` succeeds on the owner side:

```bash
curl -sS -X POST "$OWNER_BASE/send" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "peerUrl":"http://127.0.0.1:5211/a2a/jsonrpc",
    "peerDid":"<peer-did-from-connect>",
    "message":"hello from Atom",
    "encrypt":true
  }'
```

Inbox on the peer: `GET /inbox` with the peer admin token (sample default `atom-external-peer-token`).

## Custom peer (without shipping the full owner backend)

If you refuse to run `@qwixl/agent-backend`, implement the **public** surface above with:

- `createAtomA2aExpressApp` / `AtomDataObjectExecutor` from `@qwixl/a2a-transport`
- MLS initiator/responder helpers from `@qwixl/mls-session`
- Sign/verify from `@qwixl/protocol`

You will still need session persistence and handshake accept logic equivalent to what lives in agent-backend’s MLS store today. The reference sample is the supported day-one path; a standalone peer SDK is a later extraction.

## Discover listing

Invite/card connect does **not** require Discover. Community/business indexes are curated JSON today — publishing into the reference indexes is a separate ops/PR process, not part of this join path.

## Related

- Sample app: [apps/external-peer](../../apps/external-peer/)
- Owner self-host: [AGENT-BACKEND.md](./AGENT-BACKEND.md)
- Demo scheduling counterpart: [DEMO-PEER.md](./DEMO-PEER.md)
- Chat brain only: [apps/brain-stub](../../apps/brain-stub/)
- Developer index: [DEVELOPERS.md](./DEVELOPERS.md)
