# Skins

Shell skins swap design tokens on the `atom-*` CSS class contract. Modules receive serialized token values in the iframe `init` message.

Package: `@qwixl/skin-default`

| Skin | Purpose |
|---|---|
| **minimal** | Black/white template — default product skin (D055) |
| **default** | Warm reference skin |
| **dark** | Dark mode |
| **high-contrast** | Accessibility |

Primitive styles live in `primitives.css`; skins set `--atom-color-*` and aliases (`--bg`, `--text`, …).

**Chrome invariant (D041):** action/confirmation chrome does not consume skin tokens.

Pick a skin in the reference shell **Settings → Appearance**, or in the [playground](/guides/playground) when `?playground=1`.
