---
layout: home
hero:
  name: Atom
  text: A browser for the agent web
  tagline: User-owned shell, declarative compositions, agent-to-agent MLS
  actions:
    - theme: brand
      text: Quick start
      link: /guides/module-author-tutorial
    - theme: alt
      text: Playground
      link: /guides/playground
features:
  - title: Composition, not codegen
    details: Agents emit declarative UI resolved against a vetted catalog — no arbitrary code in the shell.
  - title: You own the shell
    details: Rendering, trust, and confirmation chrome belong to the person running it.
  - title: Self-hostable agents
    details: Run npx @qwixl/agent-backend on your infrastructure; managed hosting is optional.
---

## Live hosts

- Reference shell — [atom.qwixl.com](https://atom.qwixl.com)
- Module registry — [atom.registry.qwixl.com](https://atom.registry.qwixl.com)

## Monorepo quick start

```bash
pnpm install
pnpm build:packages
pnpm dev              # shell :5200
pnpm dev:demo         # personal demo (shell + your agent)
pnpm dev:embed        # embed demo :5203
pnpm dev:docs         # docs site :5206
pnpm dev:hosting      # control plane :5300 + stub agent :5301
pnpm docker:demo-peer # demo peer agent :5205
```
