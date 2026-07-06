# Atom marketing site (static HTML5)

Search engines and “View Source” read **real HTML** here — not a React SPA shell.

## Structure

| Path | Purpose |
|------|---------|
| `_partials/` | Shared header/footer fragments |
| `assemble.mjs` | Builds `index.html`, `demo/index.html`, etc. from partials + page bodies |
| `legal/` | Privacy and Terms HTML fragments (included by `assemble.mjs`) |
| `js/site.js` | Theme toggle only |
| `robots.txt`, `sitemap.xml` | SEO |

## Edit workflow

1. Change copy in `assemble.mjs` (page bodies) or `_partials/`.
2. Run `node marketing/assemble.mjs` (also runs on `pnpm dev` and `pnpm build`).
3. Open http://localhost:5200/ — static HTML. App shell is at http://localhost:5200/app/

## Production

`pnpm build` outputs:

- `dist/index.html`, `dist/demo/`, … — crawlable marketing
- `dist/app/` — React shell (auth wizard, demo connect, main UI)
