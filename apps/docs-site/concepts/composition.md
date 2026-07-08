# Composition grammar

Atom agents build read-only UI by **nesting core primitives** — not by generating code and not via task-specific shell widgets (D055).

## Layers

| Layer | Role |
|---|---|
| **Skin tokens** | `@qwixl/skin-default` — colors, radius, spacing on `atom-*` classes |
| **Core primitives** | `core/card`, `core/stack`, `core/text`, `core/heading`, `core/form`, … |
| **Registry modules** | Interactive / two-party flows only (games, meeting picker, polls) |

## Patterns

- **Grouped content:** `core/card` with `title` / `subtitle`
- **Vertical lists:** `core/stack` with `direction: "vertical"`
- **Timeline rows:** vertical stack of horizontal stacks — time column + event body
- **Forms:** one `core/form` wrapping multiple `core/choice` / `core/text-field` nodes

## Try it

Open the [playground](/guides/playground) (`pnpm dev:embed`, `?playground=1`). Load the **Schedule timeline** example to see primitive composition with the minimal skin.

## External reference

[Vercel json-render](https://json-render.dev/) validates the same catalog-guardrails thesis. Atom borrows **patterns** (prompt generation, streaming) — not the shadcn component pack or a third wire format.
