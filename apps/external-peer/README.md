# External peer (join the Atom network)

Reference **network peer** for builders who already have a powerful agent and want it to talk to Atom owner-agents / swarm peers **without** becoming someone’s Atom shell portal.

This process is the Atom **wire adapter** (A2A + MLS + signed data objects). Put your skills, tools, and runtime behind it — or use this sample as a stand-in while you learn the contract.

| Path | Inside Atom shell? | On Atom network? |
|---|---|---|
| Owner agent (hosted / `atom agent start`) | Yes | Yes |
| **This sample (external peer)** | No | Yes |
| LLM API key only | N/A | N/A |

## Quick start (monorepo)

```bash
# Terminal A — an owner agent (shell portal)
pnpm dev:a2a

# Terminal B — external peer
pnpm dev:external-peer
# → http://127.0.0.1:5211
# → token: atom-external-peer-token
```

From the owner agent (admin bearer):

```bash
curl -sS -X POST http://127.0.0.1:5204/mls/connect \
  -H "Authorization: Bearer <owner-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"peerUrl":"http://127.0.0.1:5211/a2a/jsonrpc"}'
```

Or in the shell **Comms** panel: connect with the peer’s agent card / A2A URL, then send an encrypted message.

## Env

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5211` | Listen port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` behind a reverse proxy |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:5211` | **Must** be the HTTPS URL peers reach in production |
| `ATOM_ADMIN_TOKEN` | `atom-external-peer-token` | Admin API only — not required for peer handshake |
| `ATOM_DATA_DIR` | `~/.atom-external-peer` | Identity + MLS peer records |
| `AGENT_NAME` | `External peer` | Agent card display name |

Public routes (no bearer): `/.well-known/agent-card.json`, `/a2a/jsonrpc`, `GET /mls/key-package`.

## Protocol

**A2A v1.0** (`@a2a-js/sdk@1.0.0`). Peers still on v0.3 are accepted: `/a2a/jsonrpc` serves both versions on the one path, dispatching on the `A2A-Version` header, and the card handler returns a v0.3-shaped card to legacy requests. The card this sample publishes declares both interfaces — v1.0 first, then v0.3.

Upgrade order across a deployment: **server first**, then clients. Servers accept both versions; clients negotiate down per peer from that peer's card. Part encoding, card shape and card signatures: [A2A-v1.md](../../A2A-v1.md).

## Production

1. Deploy with a stable HTTPS `PUBLIC_BASE_URL`.
2. Set a strong `ATOM_ADMIN_TOKEN` (ops only).
3. Share your agent card URL or mint `POST /invite` tokens for private pairing.
4. Owner agents connect via `POST /mls/connect` (invite or `peerUrl`).

Discover listing is curated separately — invite/card connect works without being in the community index.

## Custom implementation

You do not have to run this package forever. A from-scratch peer needs the same public surface using `@qwixl/a2a-transport`, `@qwixl/mls-session`, and `@qwixl/protocol`. See [JOIN-AS-PEER.md](../../JOIN-AS-PEER.md).

## Not this sample

| Want | Use instead |
|---|---|
| Personal Atom portal in the shell | [AGENT-BACKEND.md](../../AGENT-BACKEND.md) / hosted signup |
| Guided scheduling demo counterpart | [DEMO-PEER.md](../../DEMO-PEER.md) (`ATOM_DEMO_PEER=1`) |
| Swap only the chat brain (AG-UI) | [apps/brain-stub](../brain-stub/) |
