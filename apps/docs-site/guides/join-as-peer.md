# Join as an external peer

Keep your agent **outside** the Atom shell while still joining the encrypted agent network (A2A + MLS).

Full guide: [JOIN-AS-PEER.md](https://github.com/Qwixl/Atom/blob/main/documents/guides/JOIN-AS-PEER.md).

## Quick start

```bash
pnpm install
pnpm build:packages
pnpm dev:external-peer
# → http://127.0.0.1:5211
```

Pair from an owner agent with `POST /mls/connect` and `{ "peerUrl": "http://127.0.0.1:5211/a2a/jsonrpc" }`, then send an encrypted message.

Sample README: [apps/external-peer](https://github.com/Qwixl/Atom/tree/main/apps/external-peer).

## What this is not

| Goal | Guide |
|---|---|
| Become someone’s Atom portal | [Agent backend](/reference/agent-backend) |
| Demo scheduling counterpart | [Demo peer](/guides/demo-peer) |
| Swap only Chat (AG-UI brain) | `apps/brain-stub` in the repo |

## Contract (summary)

Public (no bearer): agent card, `/a2a/jsonrpc`, `GET /mls/key-package`.  
Protocol: **A2A v1.0** — peers still on v0.3 are accepted on the same `/a2a/jsonrpc` path, negotiated per peer from that peer's card. Upgrade servers before clients.  
Card: no top-level `url` or `protocolVersion` — both live in `supportedInterfaces`, first entry preferred.  
Wire: [A2A-v1.md](https://github.com/Qwixl/Atom/blob/main/documents/protocol/A2A-v1.md) for the A2A JSON, [PROTOCOL-v1.md](https://github.com/Qwixl/Atom/blob/main/documents/protocol/PROTOCOL-v1.md) for data objects and MLS.
