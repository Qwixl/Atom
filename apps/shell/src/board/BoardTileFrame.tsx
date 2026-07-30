import type { PersistedSurface } from "@qwixl/owner-store";
import type { ResolvedSurface, UiEvent } from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import type { ReactNode } from "react";
import {
  formatBoardTileTitle,
  isTileStale,
  provenanceConnectorLabels,
  tileAsOf,
  type EffectivePlacement,
} from "./boardLayout.js";

function formatAsOf(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BoardTileFrame({
  surface,
  resolved,
  placement,
  now,
  onPin,
  onDismiss,
  onResize,
  onMoveEarlier,
  onMoveLater,
  onEvent,
}: {
  surface: PersistedSurface;
  resolved: ResolvedSurface;
  placement: EffectivePlacement;
  now: number;
  onPin: (pinned: boolean) => void;
  onDismiss: () => void;
  onResize: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onEvent: (event: UiEvent) => void;
}) {
  const title = formatBoardTileTitle(surface.composition.intent, surface.surfaceId);
  const connectors = provenanceConnectorLabels(surface.bindings);
  const asOf = tileAsOf(surface.bindings, surface.lastRefreshedAt);
  const stale = isTileStale(surface.refresh, surface.bindings, surface.lastRefreshedAt, now);
  const degraded = surface.lastError;

  // Provenance is shell chrome from the persisted binding record — never composition props (invariant 3).
  const provenanceLine =
    connectors.length === 0
      ? "No data sources"
      : asOf.kind === "never-refreshed"
        ? `Sources: ${connectors.join(", ")} · Never refreshed`
        : `Sources: ${connectors.join(", ")} · As of ${formatAsOf(asOf.at)}`;

  const contentClass = [
    "board-tile-content",
    stale ? "board-tile-content--stale" : "",
    degraded ? "board-tile-content--degraded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={`board-tile board-tile--size-${placement.size}${placement.pinned ? " board-tile--pinned" : ""}`}
      data-surface-id={surface.surfaceId}
    >
      <header className="board-tile-frame">
        <div className="board-tile-frame-heading">
          <h3 className="board-tile-frame-title">{title}</h3>
          {stale ? <span className="board-tile-frame-badge board-tile-frame-badge--stale">Stale</span> : null}
          {degraded ? (
            <span className="board-tile-frame-badge board-tile-frame-badge--degraded">Degraded</span>
          ) : null}
        </div>
        <p className="board-tile-frame-provenance">{provenanceLine}</p>
        {degraded ? (
          <p className="board-tile-frame-error" role="status">
            {degraded.message}
            {asOf.kind === "as-of" ? ` · Last known ${formatAsOf(asOf.at)}` : " · Never refreshed"}
          </p>
        ) : null}
        <div className="board-tile-frame-controls">
          <button
            type="button"
            className="board-tile-frame-control"
            aria-pressed={placement.pinned}
            onClick={() => onPin(!placement.pinned)}
          >
            {placement.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className="board-tile-frame-control" onClick={onResize}>
            Size: {placement.size.toUpperCase()}
          </button>
          <button type="button" className="board-tile-frame-control" onClick={onMoveEarlier}>
            Earlier
          </button>
          <button type="button" className="board-tile-frame-control" onClick={onMoveLater}>
            Later
          </button>
          <button type="button" className="board-tile-frame-control board-tile-frame-control--dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </header>
      <div className={contentClass}>
        <SurfaceRenderer
          surface={resolved}
          onEvent={onEvent}
          renderInlineText={(text): ReactNode => text}
        />
      </div>
    </article>
  );
}
