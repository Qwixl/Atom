# Atom developer guide



Public entry point for building on the Atom platform (M14). Full API reference lives in the repo root markdown files and the docs site (`pnpm dev:docs`).



## Quick paths



| Goal | Start here |

|---|---|

| Run an agent backend | `npx @qwixl/agent-backend` — [AGENT-BACKEND.md](./AGENT-BACKEND.md) |

| Try MLS + scheduling | [PERSONAL-DEMO.md](./PERSONAL-DEMO.md) — `pnpm dev:demo` |
| Demo peer (counterpart agent) | [DEMO-PEER.md](./DEMO-PEER.md) — `pnpm dev:demo-peer` + wizard |

| Embed the shell | [EMBED.md](./EMBED.md) |

| Build a module | [MODULES.md](./MODULES.md) — tutorial at `apps/docs-site/guides/module-author-tutorial.md` |
| Build a connector | `apps/docs-site/guides/connector-author-tutorial.md` |

| Playground | `pnpm dev:embed` → http://localhost:5203/?playground=1 |

| Docs site | `pnpm dev:docs` → http://localhost:5206 |

| Wire protocol | [PROTOCOL-v1.md](./PROTOCOL-v1.md) |

| Security posture | [SECURITY.md](./SECURITY.md) |

| M16 launch gates | [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) |



## Production hosting security (M21)

Control plane env for production (`control.qwixl.dev`):

| Variable | Required | Notes |
|---|---|---|
| `ATOM_FLEET_MODE=docker` | yes | Fleet provisioning |
| `ATOM_FLEET_PUBLIC_URL_TEMPLATE` | yes (prod) | HTTPS only, e.g. `https://{port}.agents.qwixl.dev` |
| `ATOM_SHELL_ORIGINS` | yes | Include `https://shell-atom.vercel.app` |
| `ATOM_PROVISION_SECRET` | optional | Locks `/provision` to bearer auth; unset = 404 in production |
| `NODE_ENV=production` | yes | Fleet URL invariants + signup hardening |

Before registry deploy: `pnpm registry:verify --require-integrity --signatures`. Publisher/Sigstore keys are CI secrets only — see [SECURITY.md](./SECURITY.md) § Registry publisher hygiene.

Shell production guard: `scripts/verify-production-shell.mjs` runs on every `pnpm --filter @qwixl/shell-app build`.




Every admin route requires `Authorization: Bearer <token>`. On first start the token is printed once and saved to `agent-admin-token.txt` beside the identity file. Override with `ATOM_ADMIN_TOKEN`. The shell Comms panel has an **Admin bearer token** field.



Public routes (no token): A2A JSON-RPC, agent card, `GET /mls/key-package`.



## Skins (M14.2)



Shell skins are CSS token packages (`@qwixl/skin-default`). Pick a skin under Settings → Appearance. Modules receive serialized token values in the iframe `init` message. Action chrome does not consume skin tokens (D041).



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



Local stack: `pnpm dev:hosting` (control plane :5300 + stub agent :5301). Production: `ATOM_FLEET_MODE=docker` on control plane — see `apps/docs-site/guides/managed-hosting.md`. Shell first-run wizard supports hosted signup + self-host + demo peer paths.



Business index: `/business-index/index.json` on the shell host; query helpers in `@qwixl/business-index`.


