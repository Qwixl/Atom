# M16 launch checklist

Execute after M14 + M15 ship. Do not run the public push before the zero-terminal path and developer on-ramp exist (D040).

## Pre-launch gates

- [x] `pnpm registry:verify --require-integrity` passes on default registry (10 modules including WebCal connector)
- [ ] Docs site live with tutorial + playground links (`pnpm dev:docs` locally; deploy `apps/docs-site`)
- [ ] Demo peer agent reachable from production shell (`VITE_DEMO_PEER_URL` on shell build)
- [ ] Managed hosting wizard returns agent URL + token (`pnpm dev:hosting` locally; production needs `ATOM_FLEET_MODE=docker`)
- [ ] Business index default host populated (`apps/shell/public/business-index/index.json`)
- [x] README lead command: `npx @qwixl/agent-backend`
- [x] M13.5 WebCal connector documented in AGENT-BACKEND.md
- [x] Connector author tutorial in docs site (`guides/connector-author-tutorial.md`)

## Channel order

1. **npm/README** — badges, GIF of composition render, self-host lead
2. **Show HN + lobste.rs** — privacy/self-host angle; link demo peer
3. **Ecosystem listings** — A2A, AG-UI, MCP directories
4. **Technical write-ups** — user-owned A2UI shell; MLS commerce
5. **NGI/NLnet grant** — sovereignty angle (D028 bridge funding)

## Success measures (define before posting)

- GitHub stars / npm installs (weak reach proxies)
- Hosted signups completing wizard
- Third-party module submissions to default registry
- 30-day hosted agent retention

## Not doing

Paid ads, undisclosed influencer coverage, Product Hunt consumer launch, press release without usage proof — see `docs/05-economics/03-adoption-push-m16.md` (private corpus).
