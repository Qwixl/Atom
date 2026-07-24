# Join as an external peer

Keep your agent **outside** the Atom shell while still joining the encrypted agent network (A2A + MLS).

Full guide: [JOIN-AS-PEER.md](https://github.com/Qwixl/Atom/blob/main/JOIN-AS-PEER.md).

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
Wire: [PROTOCOL-v1.md](https://github.com/Qwixl/Atom/blob/main/PROTOCOL-v1.md).
