# Join the Atom network as an external peer

Keep your agent **outside** the Atom shell, but still talk to Atom owner-agents and other peers over **A2A + MLS**.

This is **not**:

- Pasting an LLM API key into a hosted Atom agent
- Connecting URL + token so your process *becomes* someone’s shell portal ([AGENT-BACKEND.md](./AGENT-BACKEND.md))
- Swapping only the chat brain ([apps/brain-stub](./apps/brain-stub/))

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

Details: [apps/external-peer/README.md](./apps/external-peer/README.md).

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
2. Publish **`/.well-known/agent-card.json`** (A2A 0.3.0 + Atom data-object extension) — see `@qwixl/a2a-transport` `buildAtomAgentCard`.
3. Serve **`/a2a/jsonrpc`** with an executor that accepts Atom data-object / MLS wire parts.
4. Expose **`GET /mls/key-package`** → `{ did, wire }` (public, no bearer).
5. Accept MLS handshake messages and decrypt application traffic (`@qwixl/mls-session` + `@qwixl/protocol` verify).
6. Hold a **`did:key`** Ed25519 identity; sign outbound data objects.
7. Optional: mint private invites via admin `POST /invite`, or treat the published agent card as an implicit invite ([PROTOCOL-v1.md](./PROTOCOL-v1.md)).

Wire contracts: [PROTOCOL-v1.md](./PROTOCOL-v1.md). Package building blocks: `@qwixl/a2a-transport`, `@qwixl/mls-session`, `@qwixl/protocol`. Full owner surface (admin inbox, AG-UI, vault): `@qwixl/agent-backend` — what the sample runs.

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

- Sample app: [apps/external-peer](./apps/external-peer/)
- Owner self-host: [AGENT-BACKEND.md](./AGENT-BACKEND.md)
- Demo scheduling counterpart: [DEMO-PEER.md](./DEMO-PEER.md)
- Chat brain only: [apps/brain-stub](./apps/brain-stub/)
- Developer index: [DEVELOPERS.md](./DEVELOPERS.md)
