# Playground (M14.4)

Edit composition JSON and render live — no agent backend required.

## Run locally

```bash
pnpm dev:embed
```

Open `http://localhost:5203/?playground=1`.

## Usage

1. Edit the JSON in the left pane (v1 composition schema).
2. Click **Render**.
3. Interact with the surface; events appear below the preview.

Uses `@qwixl/shell-core` + `@qwixl/renderer-web` only — the same embed path documented in [EMBED.md](https://github.com/Qwixl/Atom/blob/main/EMBED.md).

## Cross-host registry mode

Without `?playground=1`, the embed demo also exercises loading `travel/seat-map` from the public registry host.
