# Overview

Atom is an open, user-owned shell for agent-driven interfaces. Your agent composes a declarative description of the UI; your shell renders it from a trusted catalog of components.

## Positioning

Agent-rendered UI inside a conversation is now table stakes (MCP Apps, A2UI, vendor app SDKs). Atom differs in who owns the platform:

- **User-owned host.** The shell and module registry are the user's infrastructure, not a vendor's chat product. Hosted, self-hosted, or fully local — same artifact.
- **Owner-side rendering.** The owner's agent composes UI for the owner. Businesses and peers participate over signed data objects on encrypted A2A/MLS sessions — they send data, never pixels.
- **Owner-side trust chrome.** Consequential actions (payments, bookings, disclosures) render only in shell-owned chrome, are recorded in a hash-chained attestation log, and guarded profile data needs per-use approval. Sandbox policy alone is not the trust model.
- **Model-agnostic.** Any OpenAI-compatible endpoint drives the chat layer; A2A coordination is deterministic and does not pass through the LLM provider.

## Three tiers

1. **Personal agent** — owner backend (`@qwixl/agent-backend`) holding keys, store, and A2A/MLS sessions.
2. **Interface shell** — `@qwixl/shell-core` + `@qwixl/renderer-web` (reference app: `apps/shell`).
3. **Counterpart agents** — businesses and peers send signed data objects, never pixels.

## What ships in v1

- Core primitive catalog + sandboxed module iframes
- Skins via DTCG-style tokens (`@qwixl/skin-default`); **minimal** skin is the default template
- Composition playground with primitive examples (M14.4)

See [Composition grammar](/concepts/composition) and the [playground](/guides/playground). For modules, see the [module author tutorial](/guides/module-author-tutorial).
