import { useMemo, useState } from "react";
import {
  Catalog,
  registerCorePrimitives,
  resolveComposition,
  type Composition,
  type ResolvedSurface,
  type UiEvent,
} from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import { applyAtomSkin, ATOM_SKINS, type AtomSkinId } from "@qwixl/skin-default/tokens";
import {
  COMPOSITION_EXAMPLES,
  compositionToJson,
} from "./compositionExamples.js";

const DEFAULT_EXAMPLE = COMPOSITION_EXAMPLES[0]!;

export function PlaygroundApp() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const [exampleId, setExampleId] = useState(DEFAULT_EXAMPLE.id);
  const [skinId, setSkinId] = useState<AtomSkinId>("minimal");
  const [jsonText, setJsonText] = useState(() => compositionToJson(DEFAULT_EXAMPLE.composition));
  const [parseError, setParseError] = useState<string | null>(null);
  const [surface, setSurface] = useState<ResolvedSurface>(() =>
    resolveComposition(DEFAULT_EXAMPLE.composition, catalog),
  );
  const [events, setEvents] = useState<UiEvent[]>([]);

  const vocabulary = useMemo(
    () =>
      catalog
        .list()
        .filter((entry) => entry.origin === "core")
        .map((entry) => entry.spec.name)
        .sort()
        .join(", "),
    [catalog],
  );

  function loadExample(id: string) {
    const example = COMPOSITION_EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    setExampleId(id);
    const text = compositionToJson(example.composition);
    setJsonText(text);
    setParseError(null);
    setSurface(resolveComposition(example.composition, catalog));
    setEvents([]);
  }

  function applySkin(next: AtomSkinId) {
    setSkinId(next);
    applyAtomSkin(next);
  }

  function renderFromJson() {
    try {
      const composition = JSON.parse(jsonText) as Composition;
      setParseError(null);
      setSurface(resolveComposition(composition, catalog));
      setEvents([]);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="embed playground atom-app">
      <header className="embed-header">
        <h1>Composition playground</h1>
        <p>M14.4 — static compositions, skin tokens, no agent backend.</p>
        <div className="playground-toolbar">
          <label className="playground-control">
            <span>Example</span>
            <select value={exampleId} onChange={(e) => loadExample(e.target.value)}>
              {COMPOSITION_EXAMPLES.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.label}
                </option>
              ))}
            </select>
          </label>
          <label className="playground-control">
            <span>Skin</span>
            <select value={skinId} onChange={(e) => applySkin(e.target.value as AtomSkinId)}>
              {ATOM_SKINS.map((skin) => (
                <option key={skin.id} value={skin.id}>
                  {skin.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="playground-vocab">
          <strong>Catalog:</strong> {vocabulary}
        </p>
      </header>
      <main className="playground-main">
        <section className="playground-editor">
          <label className="playground-label" htmlFor="composition-json">
            Composition JSON
          </label>
          <textarea
            id="composition-json"
            className="playground-textarea"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          <button type="button" className="playground-render" onClick={renderFromJson}>
            Render
          </button>
          {parseError ? <p className="playground-error">{parseError}</p> : null}
        </section>
        <section className="playground-preview">
          <div className="playground-preview-surface">
            <SurfaceRenderer surface={surface} onEvent={(event) => setEvents((c) => [...c, event])} />
          </div>
          {events.length > 0 ? (
            <pre className="embed-events">{JSON.stringify(events, null, 2)}</pre>
          ) : null}
        </section>
      </main>
    </div>
  );
}
