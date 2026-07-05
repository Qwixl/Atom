# Module author tutorial (M14.5)

End-to-end path using `core-examples/contact-card` as the worked example.

## 1. Scaffold

```bash
pnpm exec atom-registry scaffold \
  --id acme/contact-card \
  --out ./tmp/contact-card \
  --publisher did:key:z6MkYourPublisher01
```

Or copy the reference module at `apps/shell/public/registry/core-examples/contact-card/`.

## 2. Edit the bundle

Edit `bundle/index.html` (or `apps/shell/public/modules/core-examples-contact-card/index.html`):

1. Post `{ type: "ready" }` on load.
2. Listen for `{ type: "init", props, theme }`.
3. Apply optional `theme` token values to CSS variables (`--atom-color-bg`, etc.).
4. Emit `{ type: "event", name, payload }` to `event.origin` only.

## 3. Manifest

Ensure `manifest.json` has:

- `capabilities: []`
- `bundleUrl` pointing at your static host path
- `components[].events` listing every outbound event name

Run publish to compute integrity:

```bash
pnpm exec atom-registry publish \
  --module-dir apps/shell/public/registry/core-examples/contact-card \
  --registry-dir apps/shell/public/registry \
  --bundle-base apps/shell/public
```

Or publish everything:

```bash
pnpm registry:publish-all
pnpm registry:verify
```

## 4. Local test

1. `pnpm dev` — reference shell on port 5200.
2. Settings → Module registry → index `/registry/index.json`.
3. Ask the mock agent or paste a composition referencing `core-examples/contact-card@1`.

## 5. Deploy

Deploy the static registry + bundles (reference: `atom.registry.qwixl.com`). Third-party shells point Settings at your index URL.

## Connector track (M14.5b)

See [Connector author tutorial](./connector-author-tutorial.md) — WebCal feed URLs via `connectors/webcal`.

## Example modules (M14.1)

| Module | Demonstrates |
|---|---|
| `core-examples/contact-card` | Minimal hello-world |
| `scheduling/availability-grid` | Event emission |
| `commerce/offer-comparison` | Signed fields + tier badges |
| `commerce/product-gallery` | Catalog grid |
| `data/map-view` | Leaflet in sandbox |
| `media/audio-player` | Media lifecycle events |
| `commerce/offer-comparison-pro` | Paid listing plumbing |
