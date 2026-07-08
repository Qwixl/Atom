# Playground (M14.4)

Edit composition JSON and render live — no agent backend required. Uses `@qwixl/shell-core`, `@qwixl/renderer-web`, and `@qwixl/skin-default`.

## Run locally

```bash
pnpm dev:embed
```

Open `http://localhost:5203/?playground=1` after `pnpm dev:embed` is running.

## Usage

1. Pick an **example** (starter card, schedule timeline, preference form).
2. Switch **skin** (minimal template, default warm, dark, high contrast).
3. Edit JSON in the left pane (v1 composition schema).
4. Click **Render**.
5. Interact with the surface; **ui-events** appear below the preview.

The catalog vocabulary is listed in the header. Read-only layouts should use primitives only — see [Composition grammar](/concepts/composition).

## Embed mode

Without `?playground=1`, the same app demonstrates embedding `shell-core` + `renderer-web` in a third-party host, including optional cross-host registry load (`travel/seat-map`).

## Related

- [Module author tutorial](/guides/module-author-tutorial) — when you need a sandboxed module instead of primitives
- [EMBED.md](https://github.com/Qwixl/Atom/blob/main/EMBED.md) — production embed contract
