# Brain stub (AG-UI brain only)

Minimal external-runtime demo for the **brain/body split** (D064/D065):

| Service | Role | Default port |
|---|---|---|
| **brain-stub** (this app) | Chat brain — AG-UI SSE only | 5210 |
| **atom-agent** (`docker compose`) | Body — identity, vault, A2A, connectors | 5204 |

## Local dev

```bash
pnpm dev:brain-stub
pnpm docker:agent   # or pnpm start:agent
```

Shell settings:

- **Chat provider:** AG-UI → `http://127.0.0.1:5210/agent`
- **Messages agent:** `http://127.0.0.1:5204` (body)

## Docker (brain + body)

```bash
docker compose --profile brain-body up --build
```

## Try in Chat

- Plain message — echo with owner display name from `forwardedProps.atomProfile`
- `connector status` — emits `atom.connector-invoke` (webcal getStatus); shell executes via body
- `game-move demo` — emits `atom.game-move` CUSTOM event

See `docs/21-bring-your-own-agent.md` for the full integration contract.
