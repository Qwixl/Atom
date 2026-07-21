# Atom developer guide

Public entry point for building on the Atom platform (M14). Full API reference lives in the repo root markdown files and the docs site (`pnpm dev:docs`).

## Why build here instead of a chat-platform SDK

MCP Apps and vendor app SDKs put your widget inside an AI vendor's chat product — the vendor owns the host, the identity, and the distribution. Atom modules ship into **user-owned infrastructure**: a shell the user runs (or exports and leaves with), a federated registry any publisher can host, and an agent the user picks the model for. Technically the module contract is familiar — sandboxed iframe, postMessage bridge, integrity-hashed bundle — but consequential actions and guarded data cross an owner-side trust boundary (shell chrome + attestation log) that no in-conversation widget can bypass or imitate. Positioning details: [README.md § Why Atom](./README.md#why-atom).

## Quick paths

| Goal | Start here |
|---|---|
| Run an agent backend | `npx @qwixl/agent-backend` — [AGENT-BACKEND.md](./AGENT-BACKEND.md) |
| Try MLS + scheduling | [PERSONAL-DEMO.md](./PERSONAL-DEMO.md) — `pnpm dev:demo` |
| Demo peer (counterpart agent) | [DEMO-PEER.md](./DEMO-PEER.md) — `pnpm dev` → `/demo` or `pnpm dev:demo-peer` |
| Embed the shell | [EMBED.md](./EMBED.md) |
| Build a module | [MODULES.md](./MODULES.md) — tutorial at `apps/docs-site/guides/module-author-tutorial.md` |
| Build a connector | `apps/docs-site/guides/connector-author-tutorial.md` |
| Playground | `pnpm dev:embed` → http://localhost:5203/?playground=1 |
| Docs site | `pnpm dev:docs` → http://localhost:5206 |
| Wire protocol | [PROTOCOL-v1.md](./PROTOCOL-v1.md) |
| Security posture | [SECURITY.md](./SECURITY.md) |
| Model behavior admin (ops) | [MODEL-BEHAVIOR-ADMIN.md](./MODEL-BEHAVIOR-ADMIN.md) — classes + cron script; not a Settings feature |
| M16 launch gates | [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) |

## Production hosting security (M21)

Qwixl production control plane and fleet live in private **`Qwixl/Atom-MC`** (Mission Control). This repo’s `apps/control-plane` is a **local stub** only (`HOSTED_STUB_*`).

Production env is documented in Atom-MC `.env.example`. Long-term public URLs use `{handle}.agents.atom.qwixl.com` (D098).

Before registry deploy: `pnpm registry:verify --require-integrity --signatures`. Publisher/Sigstore keys are CI secrets only — see [SECURITY.md](./SECURITY.md) § Registry publisher hygiene.

Shell production guard: `scripts/verify-production-shell.mjs` runs on every `pnpm --filter @qwixl/shell-app build`.

Every admin route requires `Authorization: Bearer <token>`. On first start the token is printed once and saved to `agent-admin-token.txt` beside the identity file. Override with `ATOM_ADMIN_TOKEN`. The shell Comms panel has an **Admin bearer token** field.

Public routes (no token): A2A JSON-RPC, agent card, `GET /mls/key-package`.

## Skins (M14.2)

Shell skins are CSS token packages (`@qwixl/skin-default`). Pick a skin under Settings → Appearance. Modules receive serialized token values in the iframe `init` message. Action chrome does not consume skin tokens (D041).

Positioning sentence: existing platforms put UI *inside their chat*; Atom makes the owner's portal *the* interface, with chat as one surface of it and agent-to-agent traffic behind it.

## Protocol alignment watch

External specs Atom tracks but does not fork effort on until a concrete integration request lands:

| Watch | Trigger | Atom seam |
|---|---|---|
| **A2UI v1 `actionResponse`** (F4-3) | v1.0 **stable** (not only RC) **and** a host needs correlated replies | Map client `action` → shell `UiEvent` (`surfaceId`/`nodeId`/`name`/`payload`); optional `wantResponse`+`actionId` would need a response channel Atom does not have today (agent emits a new composition instead). Extend `@qwixl/a2ui-adapter` only for inbound envelopes first. |
| **MCP Apps `ui://` resources** (F4-4 / F5-10) | Host requests adapter **or** Apps HTML lifecycle matches module iframe install+init | Map `ui://` + tool metadata to registry `manifest`/`bundleUrl`; keep sandboxed iframe + shell chrome. MCP Apps = vendor-host widgets; Atom modules = owner-shell catalog (D055) — do not chase ChatGPT inventory. |

**Skim log (2026-07-08):**

- [A2UI Protocol v1.0](https://a2ui.org/specification/v1.0-a2ui) is **Candidate** (updated Jun 2026). Server stream keys include `actionResponse` for `wantResponse: true` client actions. Production note on a2ui.org still points many hosts at **v0.9.1**. Adapter remains outbound/assembler-only — no code change this pass.
- MCP Apps ([SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)): `ui://` HTML (`text/html;profile=mcp-app`) in sandboxed iframes; UI↔host over MCP JSON-RPC. Spec live as extension; Atom stance unchanged — interoperability adapter **on request**, not UI strategy.

Quarterly: skim A2UI and MCP Apps release notes. Prototype adapters only when a shipping host needs them.

## Example modules (M14.1)

Ten modules in `apps/shell/public/registry/` — run `pnpm registry:verify` after edits.

| Module | Notes |
|---|---|
| `connectors/webcal` | Read-only ICS/WebCal feeds (no OAuth) |
| `core-examples/contact-card` | Hello-world / tutorial subject |
| `scheduling/availability-grid` | Slot selection events |
| `commerce/offer-comparison` | Tier badges + signed fields |
| `commerce/offer-comparison-pro` | Paid listing (beta installs free) |
| `commerce/product-gallery` | Catalog grid |
| `data/map-view` | Leaflet in sandbox |
| `media/audio-player` | Playback events |
| `travel/seat-map` | Interactive seat map |

## Managed hosting (M15)

Local stack: `pnpm dev:hosting` (stub control plane :5300 + stub agent :5301). Production fleet: **Atom-MC** (private). See `apps/docs-site/guides/managed-hosting.md`. Marketing site at `/` handles signup; `/app` is the shell.

Business index: `/business-index/index.json` on the shell host; query helpers in `@qwixl/business-index`.
