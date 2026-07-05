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

const DEFAULT_JSON = `{
  "version": 1,
  "surfaceId": "playground",
  "intent": "Editable composition",
  "root": {
    "id": "root",
    "component": "core/card",
    "props": { "title": "Playground", "subtitle": "Edit JSON and click Render" },
    "children": [
      {
        "id": "text",
        "component": "core/text",
        "props": { "text": "Change this composition and re-render." }
      }
    ]
  }
}`;

export function PlaygroundApp() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [parseError, setParseError] = useState<string | null>(null);
  const [surface, setSurface] = useState<ResolvedSurface>(() =>
    resolveComposition(JSON.parse(DEFAULT_JSON) as Composition, catalog),
  );
  const [events, setEvents] = useState<UiEvent[]>([]);

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
    <div className="embed playground">
      <header className="embed-header">
        <h1>Composition playground</h1>
        <p>M14.4 — static compositions only; no agent backend required.</p>
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
          <SurfaceRenderer surface={surface} onEvent={(event) => setEvents((c) => [...c, event])} />
          {events.length > 0 ? (
            <pre className="embed-events">{JSON.stringify(events, null, 2)}</pre>
          ) : null}
        </section>
      </main>
    </div>
  );
}
