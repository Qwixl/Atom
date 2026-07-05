# Demo peer agent (M14.6)

MLS + automatic scheduling proposal from a **counterpart** agent — not the same as `pnpm dev:demo` (personal walkthrough). See [Personal demo](./personal-demo.md) for that path.

## Setup

1. Personal agent: `pnpm dev:a2a` (or existing backend on :5204).
2. Demo peer: `pnpm dev:demo-peer` (:5205, token `atom-demo-peer-token`).
3. Shell: `pnpm dev` → first-run wizard → **Try demo peer (2 min)** → **Connect to demo**.
4. **Comms** — receive the scheduling proposal.

```bash
pnpm docker:demo-peer   # alternative
```

See [DEMO-PEER.md](https://github.com/Qwixl/Atom/blob/main/DEMO-PEER.md) for production deployment.
