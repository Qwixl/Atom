# Managed hosting (M15)

**Get an agent in 60 seconds** — optional beta path alongside self-host.

## Architecture

- One container per owner running **unmodified** `@qwixl/agent-backend`
- Control plane verbs: provision, suspend, resume, delete, report-abuse
- Subdomain addressing: `<handle>.agents.qwixl.dev` (production fleet)

## Local development

```bash
pnpm dev:hosting   # control plane :5300 + stub agent :5301
pnpm dev           # shell :5200 — first-run wizard → Create hosted agent
```

Stub mode (`HOSTED_STUB_AGENT_URL` / `HOSTED_STUB_AGENT_TOKEN`) returns a real agent URL + bearer token shape without Docker.

## Production fleet

Set on the control plane service:

| Variable | Purpose |
|---|---|
| `ATOM_FLEET_MODE=docker` | Enable Docker provisioning |
| `ATOM_AGENT_IMAGE=atom-agent:latest` | Image per owner container |
| `ATOM_CONTROL_PLANE_DATA_DIR=/data` | Persistent agent registry |
| `ATOM_SHELL_ORIGINS` | CORS for shell signup requests |

Build the agent image from repo root: `docker compose build atom-agent`.

Signup (`POST /signup`) provisions a container, returns `{ agentUrl, adminToken, handle }`. Returns **503** when fleet is unconfigured (fail-closed — no fake URLs).

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
