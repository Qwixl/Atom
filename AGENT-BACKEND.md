# Self-hosting the Atom agent backend

Owner-controlled agent backend for Phase 1 private comms: **did:key** identity, signed data objects, **MLS E2E** over **A2A**. MLS keys and signing keys never enter the browser shell (D017).

## What you get

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + agent DID |
| `GET /inbox` | Received signed data objects |
| `POST /invite` | Mint contact invitation token |
| `POST /mls/connect` | Establish MLS pair session (`peerUrl` or `invite`) |
| `POST /send` | Send signed data object (plain or MLS-encrypted) |
| `/.well-known/agent-card.json` | A2A agent card |
| `/a2a/jsonrpc` | A2A JSON-RPC transport |

Wire contracts: [PROTOCOL-v1.md](./PROTOCOL-v1.md).

## One command (npm)

Requires **Node 22+**.

```bash
# After @qwixl/agent-backend is published:
npx @qwixl/agent-backend

# Monorepo development:
pnpm install
pnpm build:packages
pnpm start:agent
```

Default admin URL: `http://127.0.0.1:5204`

In the reference shell → **Comms** → set **My agent (admin URL)** to that address.

## Docker

From a clone of this repo:

```bash
docker compose up atom-agent --build
```

Identity persists in the `atom-agent-data` volume at `/data/agent-identity.json`.

### Production behind a reverse proxy

Set `PUBLIC_BASE_URL` to the HTTPS URL clients use (for agent card + invitation tokens):

```bash
PUBLIC_BASE_URL=https://agent.example.com docker compose up atom-agent -d
```

Add your shell origin to CORS:

```bash
ATOM_SHELL_ORIGINS=https://shell.example.com docker compose up atom-agent -d
```

Bind is `0.0.0.0` inside the container; expose port `5204` or terminate TLS at the proxy.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5204` | Listen port |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Bind address |
| `PUBLIC_BASE_URL` | `http://HOST:PORT` | Public URL in agent card and invites |
| `AGENT_NAME` | `Atom agent` | Label in invitations |
| `ATOM_DATA_DIR` | `~/.atom` | Data directory |
| `ATOM_AGENT_IDENTITY_PATH` | `$ATOM_DATA_DIR/agent-identity.json` | Identity key file |
| `ATOM_SHELL_ORIGINS` | — | Extra comma-separated CORS origins for shell admin API |

## Connect two agents

```bash
# Agent A
pnpm start:agent

# Agent B (second terminal)
PORT=5205 PUBLIC_BASE_URL=http://127.0.0.1:5205 pnpm start:agent
```

In the shell **Comms** panel on each side: copy invite from A, connect from B, send encrypted messages.

## Security notes

- Identity file contains the Ed25519 private key — restrict permissions (`0600`) and back up safely.
- MLS session state is in-memory; process restart requires re-handshake (D025).
- Admin API has no auth in v1 — bind to localhost or protect with network policy / reverse-proxy auth before exposing publicly.

## Related

- [PROTOCOL-v1.md](./PROTOCOL-v1.md) — data objects, MLS, invitations
- [SECRET-STORE.md](./SECRET-STORE.md) — shell credential adapters (separate from agent keys)
