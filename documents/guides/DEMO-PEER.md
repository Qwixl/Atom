# Demo peer agent (M14.6)

Public **counterpart** agent for the reference shell: MLS handshake + automatic scheduling proposal. For the guided **personal** demo (your LLM + WebCal feed), use [PERSONAL-DEMO.md](PERSONAL-DEMO.md) (`pnpm dev:demo`) instead.

## Quick path (first-run wizard)

1. Start your personal agent: `pnpm dev:a2a` (or use an existing backend).
2. Start the demo peer (see below).
3. Open the shell (`pnpm dev`) → first-run wizard → **Try demo peer (2 min)**.
4. Wait for green checks on your agent and the demo peer → **Connect to demo**.
5. Open **Comms** — a scheduling proposal arrives from the demo peer over MLS.

## Demo peer only (developers)

```bash
pnpm dev:demo-peer
# Admin URL: http://127.0.0.1:5205
# Token: atom-demo-peer-token
```

Pair with your agent via Comms settings or the wizard. The demo peer sends a signed scheduling proposal after MLS connect.

## Docker

Requires Docker Desktop. If `docker` is not on your PATH, use `pnpm dev:demo-peer` instead.

```bash
pnpm docker:demo-peer
```

## Flow

1. Your personal agent establishes an MLS session with the demo peer.
2. Demo peer sends a signed scheduling proposal over MLS automatically.
3. Accept or decline in Comms shell chrome.

State resets when demo data dirs or container volumes are cleared. Labeled as demo only — no retention policy.

## Ports

| Service | URL | Notes |
|---|---|---|
| Demo peer | http://127.0.0.1:5205 | `ATOM_DEMO_PEER=1` |
| Your agent | http://127.0.0.1:5204 | Typical local dev agent |

## Production host

Atom-MC deploys shared demo agents on the primary droplet (`ops/swarm-host/ensure_demo_agents.sh`):

| Role | URL | Token |
|---|---|---|
| Visitor personal agent | `https://demo.agents.atom.qwixl.com` | `atom-demo-alice-token` |
| Demo peer (`ATOM_DEMO_PEER=1`) | `https://demopeer.agents.atom.qwixl.com` | `atom-demo-peer-token` |

The website build sets `VITE_DEMO_PERSONAL_AGENT_*` and `VITE_DEMO_PEER_*` to those values so `/app/?demo=1` works with no account.
