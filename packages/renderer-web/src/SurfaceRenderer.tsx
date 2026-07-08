import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  validateHttpsUrl,
  type JsonObject,
  type JsonValue,
  type ResolvedNode,
  type ResolvedSurface,
  type UiEvent,
} from "@qwixl/shell-core";
import { createModuleBridge, MODULE_IFRAME_SANDBOX, resolveModuleBundleUrl } from "./moduleBridge.js";

export interface SurfaceRendererProps {
  surface: ResolvedSurface;
  onEvent: (event: UiEvent) => void;
  /** Optional inline text renderer (e.g. markdown links with link tool menu). */
  renderInlineText?: (text: string) => ReactNode;
}

interface RenderContext {
  surfaceId: string;
  emit: (node: ResolvedNode, name: string, payload?: JsonValue) => void;
  renderInlineText?: (text: string) => ReactNode;
}

function str(props: JsonObject | undefined, key: string, fallback = ""): string {
  const value = props?.[key];
  return typeof value === "string" ? value : fallback;
}

function num(props: JsonObject | undefined, key: string): number | undefined {
  const value = props?.[key];
  return typeof value === "number" ? value : undefined;
}

/** Renders any node from raw data alone. Always succeeds, never pretty. */
function FallbackView({ node, reason }: { node: ResolvedNode & { kind: "fallback" }; reason: string }) {
  return (
    <div className="atom-fallback">
      <div className="atom-fallback-header">
        <span className="atom-fallback-badge">fallback</span>
        <span>
          {node.node.component}
          {node.node.semanticRole ? ` (${node.node.semanticRole})` : ""} — {reason}
        </span>
      </div>
      {node.node.props ? (
        <pre className="atom-fallback-data">{JSON.stringify(node.node.props, null, 2)}</pre>
      ) : null}
    </div>
  );
}

/** True when rendering inside a core/form (choices become form fields). */
const FormScopeContext = createContext(false);

interface ChoiceOption {
  id?: string;
  label?: string;
  description?: string;
  detail?: string;
  recommended?: boolean;
}

function ChoiceOptionContent({ option, id }: { option: ChoiceOption; id: string }) {
  return (
    <>
      <span className="atom-choice-label">
        {option.label ?? id}
        {option.recommended ? <span className="atom-choice-recommended">recommended</span> : null}
      </span>
      {option.description ? (
        <span className="atom-choice-description">{option.description}</span>
      ) : null}
      {option.detail ? <span className="atom-choice-detail">{option.detail}</span> : null}
    </>
  );
}

function ChoiceView({ node, context }: { node: ResolvedNode; context: RenderContext }) {
  const insideForm = useContext(FormScopeContext);
  const [selected, setSelected] = useState<string | null>(null);
  const props = node.node.props;
  const options = (props?.options ?? []) as ChoiceOption[];
  const name = typeof props?.name === "string" ? props.name : node.node.id;
  const multi = props?.multi === true;
  const legend = typeof props?.label === "string" ? props.label : undefined;

  if (insideForm) {
    // Form-scoped: a named radio/checkbox group collected on submit.
    // No per-click events; the form's single "submitted" event carries it.
    return (
      <fieldset className="atom-choice atom-choice-form" aria-label={legend ?? "Options"}>
        {legend ? <legend className="atom-choice-legend">{legend}</legend> : null}
        {options.map((option, index) => {
          const id = option.id ?? String(index);
          return (
            <label key={id} className="atom-choice-option atom-choice-option-input">
              <input
                type={multi ? "checkbox" : "radio"}
                name={name}
                value={id}
                defaultChecked={option.recommended === true && !multi}
              />
              <span className="atom-choice-option-body">
                <ChoiceOptionContent option={option} id={id} />
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  // Standalone: single question, emits immediately and locks.
  return (
    <div className="atom-choice" role="listbox" aria-label={legend ?? "Options"}>
      {options.map((option, index) => {
        const id = option.id ?? String(index);
        const isSelected = selected === id;
        return (
          <button
            key={id}
            role="option"
            aria-selected={isSelected}
            className={`atom-choice-option${isSelected ? " selected" : ""}`}
            disabled={selected !== null}
            onClick={() => {
              setSelected(id);
              context.emit(node, "selected", { optionId: id });
            }}
          >
            <ChoiceOptionContent option={option} id={id} />
          </button>
        );
      })}
    </div>
  );
}

function FormView({
  node,
  context,
  children,
}: {
  node: ResolvedNode;
  context: RenderContext;
  children: ReactNode;
}) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: JsonObject = {};
    for (const key of new Set(data.keys())) {
      const all = data.getAll(key).filter((v): v is string => typeof v === "string");
      // Checkbox groups produce arrays; everything else a single string.
      values[key] = all.length > 1 ? all : (all[0] ?? "");
    }
    setSubmitted(true);
    context.emit(node, "submitted", { values });
  }

  return (
    <form className="atom-form" onSubmit={handleSubmit}>
      <FormScopeContext.Provider value={true}>
        <fieldset disabled={submitted} className="atom-form-fields">
          {children}
        </fieldset>
      </FormScopeContext.Provider>
      <button type="submit" className="atom-button" disabled={submitted}>
        {str(node.node.props, "submitLabel", "Submit")}
      </button>
    </form>
  );
}

function ModuleFrameView({
  node,
  context,
  bundleUrl,
}: {
  node: ResolvedNode & { kind: "component" };
  context: RenderContext;
  bundleUrl: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const propsRef = useRef(node.node.props);
  propsRef.current = node.node.props;
  const bridge = useMemo(() => createModuleBridge(bundleUrl), [bundleUrl]);

  const sendInit = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    bridge.sendInit(win, (propsRef.current ?? {}) as Record<string, unknown>);
  }, [bridge]);

  useEffect(() => {
    sendInit();
  }, [node.node.props, sendInit]);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!bridge.isAllowedMessageOrigin(event.origin)) return;
      const data = event.data as { type?: string; name?: string; payload?: JsonValue } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "ready") {
        sendInit();
        return;
      }
      if (data.type === "event" && typeof data.name === "string") {
        context.emit(node, data.name, data.payload);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [bridge, context, node, sendInit]);

  return (
    <div className="atom-module">
      <div className="atom-module-badge">{node.entry.spec.name}</div>
      <iframe
        ref={iframeRef}
        className="atom-module-frame"
        src={resolveModuleBundleUrl(bundleUrl)}
        sandbox={MODULE_IFRAME_SANDBOX}
        title={node.entry.spec.name}
        onLoad={sendInit}
      />
    </div>
  );
}

function ChartView({ node }: { node: ResolvedNode }) {
  const series = (node.node.props?.series ?? []) as Array<{
    label?: string;
    points?: Array<{ x?: JsonValue; y?: number }>;
  }>;
  const width = 480;
  const height = 180;
  const padding = 24;

  const allPoints = series.flatMap((s) => s.points ?? []);
  const ys = allPoints.map((p) => (typeof p.y === "number" ? p.y : 0));
  const maxY = Math.max(...ys, 1);
  const minY = Math.min(...ys, 0);
  const span = maxY - minY || 1;

  return (
    <div className="atom-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Chart">
        {series.map((s, seriesIndex) => {
          const points = s.points ?? [];
          const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
          const path = points
            .map((point, index) => {
              const x = padding + index * step;
              const y =
                height - padding - (((point.y ?? 0) - minY) / span) * (height - padding * 2);
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <path
              key={seriesIndex}
              d={path}
              fill="none"
              className={`atom-chart-series atom-chart-series-${seriesIndex % 4}`}
            />
          );
        })}
      </svg>
      <div className="atom-chart-legend">
        {series.map((s, index) => (
          <span key={index} className={`atom-chart-legend-item atom-chart-series-${index % 4}`}>
            {s.label ?? `Series ${index + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}

function DisclosureView({ node, children }: { node: ResolvedNode; children: ReactNode }) {
  return (
    <details className="atom-disclosure">
      <summary>{str(node.node.props, "summary", "Details")}</summary>
      <div className="atom-disclosure-body">{children}</div>
    </details>
  );
}

function renderResolved(resolved: ResolvedNode, context: RenderContext): ReactNode {
  const children = resolved.children.map((child) => (
    <RenderNode key={child.node.id} resolved={child} context={context} />
  ));

  if (resolved.kind === "fallback") {
    return (
      <>
        <FallbackView node={resolved} reason={resolved.reason} />
        {children}
      </>
    );
  }

  const { node } = resolved;
  const props = node.props;

  if (resolved.kind === "component" && resolved.entry.origin === "module") {
    if (resolved.moduleBundleUrl) {
      return (
        <>
          <ModuleFrameView node={resolved} context={context} bundleUrl={resolved.moduleBundleUrl} />
          {children}
        </>
      );
    }
    return (
      <>
        <FallbackView
          node={{ kind: "fallback", node: resolved.node, reason: "no-substitute", children: resolved.children }}
          reason="module bundle unavailable"
        />
        {children}
      </>
    );
  }

  switch (resolved.entry.spec.name) {
    case "core/text":
      return (
        <p className="atom-text">
          {context.renderInlineText
            ? context.renderInlineText(str(props, "text"))
            : str(props, "text")}
        </p>
      );

    case "core/heading": {
      const level = num(props, "level") ?? 2;
      const Tag = (level <= 1 ? "h2" : level === 2 ? "h3" : "h4") as "h2" | "h3" | "h4";
      return <Tag className="atom-heading">{str(props, "text")}</Tag>;
    }

    case "core/image": {
      const src = validateHttpsUrl(str(props, "src"));
      if (!src) {
        return (
          <figure className="atom-image atom-image-blocked">
            <figcaption>Image blocked — https URL required</figcaption>
          </figure>
        );
      }
      return (
        <figure className="atom-image">
          <img src={src} alt={str(props, "alt")} referrerPolicy="no-referrer" />
          {str(props, "caption") ? <figcaption>{str(props, "caption")}</figcaption> : null}
        </figure>
      );
    }

    case "core/list": {
      const items = (props?.items ?? []) as JsonValue[];
      const ordered = props?.ordered === true;
      const ListTag = ordered ? "ol" : "ul";
      return (
        <ListTag className="atom-list">
          {items.map((item, index) => (
            <li key={index}>
              {typeof item === "string"
                ? context.renderInlineText
                  ? context.renderInlineText(item)
                  : item
                : JSON.stringify(item)}
            </li>
          ))}
        </ListTag>
      );
    }

    case "core/table": {
      const columns = (props?.columns ?? []) as string[];
      const rows = (props?.rows ?? []) as JsonValue[][];
      return (
        <div className="atom-table-wrap">
          <table className="atom-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={index}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      {typeof cell === "string" || typeof cell === "number"
                        ? cell
                        : JSON.stringify(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "core/card":
      return (
        <section className="atom-card">
          {str(props, "title") ? (
            <header className="atom-card-header">
              <span className="atom-card-title">{str(props, "title")}</span>
              {str(props, "subtitle") ? (
                <span className="atom-card-subtitle">{str(props, "subtitle")}</span>
              ) : null}
            </header>
          ) : null}
          <div className="atom-card-body">{children}</div>
        </section>
      );

    case "core/choice":
      return <ChoiceView node={resolved} context={context} />;

    case "core/form":
      return (
        <FormView node={resolved} context={context}>
          {children}
        </FormView>
      );

    case "core/text-field":
      return (
        <label className="atom-field">
          <span className="atom-field-label">{str(props, "label")}</span>
          <input
            name={str(props, "name")}
            placeholder={str(props, "placeholder")}
            defaultValue={str(props, "value")}
          />
        </label>
      );

    case "core/action":
      return (
        <button
          className="atom-button atom-button-secondary"
          onClick={() => context.emit(resolved, "activated")}
        >
          {str(props, "label", "Continue")}
        </button>
      );

    case "core/status": {
      const tone = str(props, "tone", "info");
      return <div className={`atom-status atom-status-${tone}`}>{str(props, "text")}</div>;
    }

    case "core/progress": {
      const value = num(props, "value");
      return (
        <div className="atom-progress" role="progressbar" aria-valuenow={value}>
          {str(props, "label") ? (
            <span className="atom-progress-label">{str(props, "label")}</span>
          ) : null}
          <div className="atom-progress-track">
            <div
              className={`atom-progress-bar${value === undefined ? " indeterminate" : ""}`}
              style={value !== undefined ? { width: `${value}%` } : undefined}
            />
          </div>
        </div>
      );
    }

    case "core/chart":
      return <ChartView node={resolved} />;

    case "core/stack": {
      const direction = str(props, "direction", "vertical");
      return <div className={`atom-stack atom-stack-${direction}`}>{children}</div>;
    }

    case "core/disclosure":
      return <DisclosureView node={resolved}>{children}</DisclosureView>;

    default:
      // Registered in the catalog but not implemented by this renderer:
      // treat as fallback rather than failing (resilience rule).
      return (
        <FallbackView
          node={{ ...resolved, kind: "fallback", reason: "no-substitute" }}
          reason="not implemented by this renderer"
        />
      );
  }
}

function RenderNode({ resolved, context }: { resolved: ResolvedNode; context: RenderContext }) {
  const substitutionNotice =
    resolved.kind === "substituted" ? (
      <div className="atom-substitution-notice">
        {resolved.requested} unavailable — rendered as {resolved.entry.spec.name}
      </div>
    ) : null;

  return (
    <div className="atom-node">
      {substitutionNotice}
      {renderResolved(resolved, context)}
    </div>
  );
}

export function SurfaceRenderer({ surface, onEvent, renderInlineText }: SurfaceRendererProps) {
  const context: RenderContext = {
    surfaceId: surface.surfaceId,
    renderInlineText,
    emit: (resolved, name, payload) => {
      // Enforce the sandbox contract: drop events the catalog spec does not declare.
      if (resolved.kind !== "fallback") {
        const declared = resolved.entry.spec.events ?? [];
        if (!declared.includes(name)) {
          console.warn(
            `[atom-shell] dropped undeclared event "${name}" from ${resolved.entry.spec.name}`,
          );
          return;
        }
      }
      onEvent({
        surfaceId: surface.surfaceId,
        nodeId: resolved.node.id,
        name,
        payload,
        timestamp: Date.now(),
      });
    },
  };

  return (
    <div className="atom-surface">
      <RenderNode resolved={surface.root} context={context} />
    </div>
  );
}
