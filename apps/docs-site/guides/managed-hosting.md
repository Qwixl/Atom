# Managed hosting (M15)

**Get an agent in 60 seconds** — optional beta path alongside self-host.

## Architecture

- One container per owner running **unmodified** `@qwixl/agent-backend`
- **Local:** `apps/control-plane` stub (`pnpm dev:hosting`)
- **Production:** private **Atom-MC** (`Qwixl/Atom-MC`) — Docker fleet, multi-host burst, NPC ops
- Addressing: `https://{handle}.agents.atom.qwixl.com` (D098); `{port}.agents…` transitional
- Reachability SKUs (GBP, D094): sleep £5 / hourly £10 / always-on £20 / business £50 — beta charges waived

## Local development

```bash
pnpm dev:hosting   # stub control plane :5300 + stub agent :5301
pnpm dev           # shell :5200 — first-run wizard → Create hosted agent
```

Stub mode (`HOSTED_STUB_AGENT_URL` / `HOSTED_STUB_AGENT_TOKEN`) returns a real agent URL + bearer token shape without Docker.

## Production fleet

Configured in **Atom-MC** (not this public repo). See Atom-MC `.env.example` and `docker compose up control-plane`.

Build the agent image from **this** repo: `docker compose build atom-agent`.
## API

- `POST /signup` — `{ email, handle?, acceptAup }` → agent URL + admin token
- `GET /policy/acceptable-use` — AUP markdown
- `POST /report-abuse` — abuse report queue
- `POST /agents/:id/suspend` / `resume` / `DELETE` — fleet management

Shell build: set `VITE_CONTROL_PLANE_URL` to the control plane origin for production hosted signup.

## Shell wizard

First launch → **Create hosted agent** calls the control plane and saves admin URL + token in Comms settings.

**Custody notice:** hosted agents mean the operator holds your keys and store. Export (M13.4) and self-host remain the structural exit.

## Business discovery (M15.7)

Default business index at `/business-index/index.json` on the shell host. Client-side filter via `@qwixl/business-index` — no server-side search API in v1.
