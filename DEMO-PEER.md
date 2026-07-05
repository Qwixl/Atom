# Demo peer agent (M14.6)

Public **counterpart** agent for the reference shell: MLS handshake + automatic scheduling proposal. For the guided **personal** demo (your LLM + WebCal feed), use [PERSONAL-DEMO.md](./PERSONAL-DEMO.md) (`pnpm dev:demo`) instead.

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

Deploy the same `@qwixl/agent-backend` image with `ATOM_DEMO_PEER=1` and a known `ATOM_ADMIN_TOKEN`. Point the production shell build at the public URL (`VITE_DEMO_PEER_URL`).
