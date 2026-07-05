# Launch — Phase 1 private comms (M7)

Open-source, privacy-first, owner-controlled agent-to-agent communications. Positioning per [D006](docs/06-decisions-log.md#d006) and trust-ladder Phase 1 ([docs/02-architecture/03-trust-ladder.md](docs/02-architecture/03-trust-ladder.md)).

## What ships in M7

| Layer | What | How to run |
|---|---|---|
| **Protocol** | Signed data objects, `did:key`, MLS E2E, invitation tokens | `@qwixl/protocol`, `@qwixl/a2a-transport`, `@qwixl/mls-session` on npm |
| **Agent backend** | A2A transport, MLS, admin API, optional AG-UI LLM | `npx @qwixl/agent-backend` or [AGENT-BACKEND.md](./AGENT-BACKEND.md) |
| **Reference shell** | Comms panel, profile/owner store, AG-UI + mock providers | `pnpm dev` (monorepo) or [atom.qwixl.com](https://atom.qwixl.com) |

No commerce, no payments, no centralized identity operator.

## Quick start (two owners)

**Owner A — agent backend**

```bash
npx @qwixl/agent-backend
# or: LLM_API_KEY=sk-... npx @qwixl/agent-backend  (enables POST /agent for AG-UI)
```

**Owner A — shell**

1. Open reference shell → **Comms** → set admin URL `http://127.0.0.1:5204`
2. **Copy my invite** → send token to Owner B over any channel

**Owner B**

1. Run their own `atom-agent` (port 5205: `PORT=5205 PUBLIC_BASE_URL=http://127.0.0.1:5205 …`)
2. Shell **Comms** → paste invite → **Connect**
3. Send encrypted messages (MLS badge when session is up)

**Optional — AG-UI with server-side LLM keys (D017)**

- Set `LLM_API_KEY` on the agent backend; shell **Settings → AG-UI** → `http://127.0.0.1:5204/agent`
- Provider keys never enter the browser on production deployments

## Positioning (D006)

- **Audience:** privacy-first early adopters; self-hosters; developers embedding `@qwixl/shell-core`
- **Message:** your agent, your keys, your shell — counterpart agents get proofs and scoped slices, not your platform login
- **Distribution:** GitHub (`Qwixl/Atom`), npm (`@qwixl/*`), Docker Compose for agent backend
- **Not claiming:** mainstream scale, incumbent replacement, or sustainable revenue (see go-to-market precedents in private docs)

## Security posture (v1)

- MLS keys and LLM API keys on **owner-controlled backend**, not in browser JS (D017, D023)
- Guarded owner-store records require shell chrome unless pre-approved per contact (`standingDisclosure` on `trusted-agents`)
- Admin API has no auth in v1 — bind to localhost or protect with network policy before public exposure

## Deferred past M7

- Multi-device owner-store sync (research — M10)
- Browser extension → OS keychain bridge for users who will not self-host (post-desktop shell)
- Managed/hosted agent offering (optional; same packages, operator-run infra)
- ATProto-style handle→DID discovery (optional; D026)

## Related public docs

- [PROTOCOL-v1.md](./PROTOCOL-v1.md) — wire contracts
- [AGENT-BACKEND.md](./AGENT-BACKEND.md) — self-hosting
- [SECRET-STORE.md](./SECRET-STORE.md) — credential adapters (D027)
- [EMBED.md](./EMBED.md) — embed `@qwixl/shell-core` in your product
