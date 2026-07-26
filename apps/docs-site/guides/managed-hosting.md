# Managed hosting (local stub)

Optional path to try hosted signup UX alongside self-host. This public repo ships a **local control-plane stub** only.

## Architecture

- Agent runtime: unmodified `@qwixl/agent-backend` (self-host or any operator)
- Local stub: `apps/control-plane` via `pnpm dev:hosting` — returns a stub agent URL + bearer token shape (no container orchestration in this package)
- Addressing for your own deploy is whatever you configure (`VITE_CONTROL_PLANE_URL`, agent public URL)

Commercial hosted products are out of scope for this Apache-2.0 tree.

## Local development

```bash
pnpm dev:hosting   # stub control plane :5300 + stub agent :5301
pnpm dev           # shell :5200 — first-run wizard → Create hosted agent
```

Set `HOSTED_STUB_AGENT_URL` / `HOSTED_STUB_AGENT_TOKEN` (see root `.env.example`).

## API (stub)

- `POST /signup` — `{ email, handle?, acceptAup }` → agent URL + admin token
- `GET /policy/acceptable-use` — AUP markdown
- `POST /report-abuse` — abuse report queue
- `POST /agents/:id/suspend` / `resume` / `DELETE` — agent lifecycle hooks on the stub store

Shell build: set `VITE_CONTROL_PLANE_URL` to your control-plane origin when testing hosted signup.

## Shell wizard

First launch → **Create hosted agent** calls the control plane and saves admin URL + token in Comms settings.

**Custody notice:** any hosted operator may hold keys and store on your behalf. Export and self-host remain the structural exit.

## Business discovery

Default business index at `/business-index/index.json` on the shell host. Client-side filter via `@qwixl/business-index`.
