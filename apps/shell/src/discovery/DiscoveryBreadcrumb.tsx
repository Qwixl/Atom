import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LINK_INTENT_LABELS } from "../chat/linkIntent.js";
import type { DiscoveryPath, DiscoveryPathStep } from "./discoveryPath.js";
import { listDiscoveryHistory } from "./discoveryPath.js";

function truncateTitle(title: string, max = 28): string {
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function DiscoveryBreadcrumb({
  path,
  history = [],
  onStepSelect,
  onDismiss,
  onResumePath,
}: {
  path: DiscoveryPath;
  /** Stored exploration branches for the history menu. */
  history?: readonly DiscoveryPath[];
  onStepSelect?: (step: DiscoveryPathStep) => void;
  onDismiss?: () => void;
  onResumePath?: (pathId: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  if (path.steps.length === 0) return null;
  const activeStep = path.steps[path.steps.length - 1];
  const otherPaths = listDiscoveryHistory(history).filter((entry) => entry.id !== path.id);

  function updateOverflow() {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(max - el.scrollLeft > 2);
  }

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    updateOverflow();
  }, [path.id, path.steps.length]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateOverflow();
    const onScroll = () => updateOverflow();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOverflow) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateOverflow);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [path.id, path.steps.length]);

  useEffect(() => {
    if (!historyOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (historyMenuRef.current?.contains(target)) return;
      setHistoryOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [historyOpen]);

  return (
    <nav className="discovery-breadcrumb" aria-label="Discovery path">
      <div className="discovery-breadcrumb-history-wrap" ref={historyMenuRef}>
        <button
          type="button"
          className="discovery-breadcrumb-history"
          aria-label="Discovery history"
          aria-expanded={historyOpen}
          aria-haspopup="menu"
          title="Discovery history"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          History
        </button>
        {historyOpen ? (
          <div className="discovery-breadcrumb-history-menu" role="menu">
            <div className="discovery-breadcrumb-history-heading">Current</div>
            <button
              type="button"
              role="menuitem"
              className="discovery-breadcrumb-history-item is-current"
              disabled
            >
              {path.label}
              <span className="discovery-breadcrumb-history-meta">
                {path.steps.length} step{path.steps.length === 1 ? "" : "s"}
              </span>
            </button>
            {otherPaths.length > 0 ? (
              <>
                <div className="discovery-breadcrumb-history-heading">Recent</div>
                {otherPaths.slice(0, 8).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className="discovery-breadcrumb-history-item"
                    onClick={() => {
                      onResumePath?.(entry.id);
                      setHistoryOpen(false);
                    }}
                  >
                    {entry.label}
                    <span className="discovery-breadcrumb-history-meta">
                      {entry.steps.length} step{entry.steps.length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <p className="discovery-breadcrumb-history-empty">No other paths yet</p>
            )}
          </div>
        ) : null}
      </div>

      <div
        className={`discovery-breadcrumb-fade${canScrollLeft ? " has-left" : ""}${canScrollRight ? " has-right" : ""}`}
      >
        <div
          ref={trackRef}
          className="discovery-breadcrumb-track"
          tabIndex={0}
          role="list"
          aria-label={`${path.label} steps`}
          onClick={() => {
            /* focus + wheel/touch scroll remain available while single-line */
          }}
        >
          <span className="discovery-breadcrumb-label" role="listitem">
            {truncateTitle(path.label, 22)}
          </span>
          {path.steps.map((step) => {
            const isActive = step.id === activeStep?.id;
            const label = `${LINK_INTENT_LABELS[step.intent]}: ${step.title}`;
            return (
              <span key={step.id} className="discovery-breadcrumb-segment" role="listitem">
                <span className="discovery-breadcrumb-sep" aria-hidden="true">
                  /
                </span>
                <button
                  type="button"
                  className={`discovery-breadcrumb-step${isActive ? " is-active" : ""}`}
                  title={label}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => onStepSelect?.(step)}
                >
                  <span className="discovery-breadcrumb-step-intent">
                    {LINK_INTENT_LABELS[step.intent]}
                  </span>
                  <span className="discovery-breadcrumb-step-title">
                    {truncateTitle(step.title)}
                  </span>
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {onDismiss ? (
        <button
          type="button"
          className="discovery-breadcrumb-dismiss"
          aria-label="Hide discovery path"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </nav>
  );
}
