# Embed Atom in your app

Goal: import `@qwixl/shell-core` and `@qwixl/renderer-web`, render agent compositions, and wire events back — in under an hour.

Reference: [`apps/embed-demo`](./apps/embed-demo) (~150 lines). Live reference shell: [atom.qwixl.com](https://atom.qwixl.com).

## 1. Install

```bash
pnpm add @qwixl/shell-core @qwixl/renderer-web react react-dom
# optional: agent transport + registry
pnpm add @qwixl/ag-ui-adapter @qwixl/a2ui-adapter
```

Requires **Node 22+** and a bundler that resolves the package `development` export in dev (Vite recommended).

## 2. Vite config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["development", "import", "module", "browser", "default"],
  },
});
```

## 3. Minimal host

```tsx
import { useMemo, useState } from "react";
import {
  Catalog,
  registerCorePrimitives,
  resolveComposition,
  type Composition,
  type UiEvent,
} from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";

const DEMO: Composition = {
  version: 1,
  surfaceId: "demo-1",
  root: {
    id: "root",
    component: "core/card",
    props: { title: "Hello from your host" },
    children: [
      {
        id: "text",
        component: "core/text",
        props: { text: "Your app owns chrome, trust, and layout." },
      },
    ],
  },
};

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const [surface] = useState(() => resolveComposition(DEMO, catalog));
  const [events, setEvents] = useState<UiEvent[]>([]);

  return (
    <SurfaceRenderer
      surface={surface}
      onEvent={(event) => setEvents((e) => [...e, event])}
    />
  );
}
```

Run: `pnpm dev` — you should see a card with text.

## 4. Agent-driven surfaces (optional)

Implement or inject an `AgentSession` (`@qwixl/shell-core`) and subscribe to `composition` outputs. Adapters:

| Adapter | Package | Use when |
|---|---|---|
| AG-UI backend | `@qwixl/ag-ui-adapter` | Remote agent over AG-UI |
| Live LLM | `@qwixl/agent-llm` | Monorepo / self-hosted only |
| Mock | inline | Tests and demos |

For production embeds, prefer **AG-UI** so credentials stay on your backend.

## 5. Module registry (optional)

Load community modules from a static registry index:

```tsx
import { ModuleRegistry } from "@qwixl/shell-core";

const registry = new ModuleRegistry({
  indexUrl: "https://atom.registry.qwixl.com/registry/index.json",
  trust: { requireIntegrity: true },
});

await registry.ensureModules(catalog, composition);
const surface = resolveComposition(composition, catalog);
```

Point `indexUrl` at your own fork; default public host: [atom.registry.qwixl.com](https://atom.registry.qwixl.com).

## 6. What the host must own

Not included in `shell-core` — your app implements these:

- **Confirmation chrome** for `consequential-action` outputs (payment, permission, confirmation).
- **Attestation log** persistence (`AttestationLog` in shell-core gives the chain; you persist it).
- **Agent connection config** and secret storage.
- **Layout chrome** around the feed.

See [API-v1.md](./API-v1.md) for the frozen wire contracts.

## 7. Checklist (< 1 hour)

| Step | Done? |
|---|---|
| Install packages, Vite `development` condition | |
| Render a static `Composition` via `SurfaceRenderer` | |
| Receive at least one `UiEvent` (e.g. `core/choice` → `selected`) | |
| (Optional) Load one module from registry | |
| (Optional) Wire `AgentSession` subscribe loop | |

Proof point #4 passes when an engineer outside this repo completes the checklist without modifying `@qwixl/*` sources.
