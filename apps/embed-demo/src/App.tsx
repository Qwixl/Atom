import { useEffect, useMemo, useState } from "react";
import {
  Catalog,
  ModuleRegistry,
  registerCorePrimitives,
  resolveComposition,
  type Composition,
  type ResolvedSurface,
  type UiEvent,
} from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";

const CROSS_HOST_REGISTRY =
  import.meta.env.VITE_REGISTRY_URL ?? "https://atom.registry.qwixl.com/registry/index.json";

const DEMO_COMPOSITION: Composition = {
  version: 1,
  surfaceId: "embed-demo-1",
  intent: "Proof point #4: embeddable engine",
  root: {
    id: "root",
    component: "core/card",
    props: {
      title: "Embedded in a third-party host",
      subtitle: "This app is ~80 lines; shell-core + renderer-web do the rest",
    },
    children: [
      {
        id: "intro",
        component: "core/text",
        props: {
          text: "Any product can import @qwixl/shell-core and @qwixl/renderer-web, register the catalog, resolve agent compositions, and render — without using the reference shell app.",
        },
      },
      {
        id: "pick",
        component: "core/choice",
        semanticRole: "input/choice",
        events: ["selected"],
        props: {
          options: [
            { id: "yes", label: "Looks embeddable", recommended: true },
            { id: "no", label: "Needs more wiring" },
          ],
        },
      },
    ],
  },
};

const SEAT_MAP_COMPOSITION: Composition = {
  version: 1,
  surfaceId: "embed-demo-seat-map",
  intent: "Cross-host registry load",
  root: {
    id: "root",
    component: "core/card",
        props: { title: "Seat selection", subtitle: "Module from atom.registry.qwixl.com" },
    children: [
      {
        id: "map",
        component: "travel/seat-map@1",
        semanticRole: "input/seat-map",
        events: ["seatSelected"],
        props: {
          flight: "ANA NH212 · LHR → HND",
          taken: ["18A", "19B", "20C", "22D"],
          recommended: ["22C", "23C"],
        },
      },
    ],
  },
};

type DemoMode = "core" | "registry";

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const registry = useMemo(
    () =>
      new ModuleRegistry({
        indexUrl: CROSS_HOST_REGISTRY,
        trust: { requireIntegrity: true },
      }),
    [],
  );

  const [mode, setMode] = useState<DemoMode>("core");
  const [surface, setSurface] = useState<ResolvedSurface>(() =>
    resolveComposition(DEMO_COMPOSITION, catalog),
  );
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [registryStatus, setRegistryStatus] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "core") {
      setRegistryStatus(null);
      setSurface(resolveComposition(DEMO_COMPOSITION, catalog));
      return;
    }

    let cancelled = false;
    void (async () => {
      setRegistryStatus(`Loading from ${CROSS_HOST_REGISTRY}…`);
      try {
        await registry.ensureModules(catalog, SEAT_MAP_COMPOSITION);
        if (cancelled) return;
        setSurface(resolveComposition(SEAT_MAP_COMPOSITION, catalog));
        setRegistryStatus(`Installed travel/seat-map from cross-host registry`);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setRegistryStatus(`Registry failed: ${message}`);
        setSurface(resolveComposition(SEAT_MAP_COMPOSITION, catalog));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, catalog, registry]);

  function handleEvent(event: UiEvent) {
    setEvents((current) => [...current, event]);
  }

  return (
    <div className="embed">
      <header className="embed-header">
        <h1>Third-party host</h1>
        <p>Proof point #4 — not the Atom reference shell</p>
        <div className="embed-mode">
          <button className={mode === "core" ? "active" : ""} onClick={() => setMode("core")}>
            Core only
          </button>
          <button className={mode === "registry" ? "active" : ""} onClick={() => setMode("registry")}>
            Cross-host registry
          </button>
        </div>
        {registryStatus ? <p className="embed-registry-status">{registryStatus}</p> : null}
      </header>
      <main className="embed-main">
        <SurfaceRenderer surface={surface} onEvent={handleEvent} />
        {events.length > 0 ? (
          <pre className="embed-events">{JSON.stringify(events, null, 2)}</pre>
        ) : null}
      </main>
    </div>
  );
}
