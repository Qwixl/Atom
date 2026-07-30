import { useCallback, useMemo, useState } from "react";
import { resolveComposition, type Catalog, type JsonValue, type ModuleRegistry, type UiEvent } from "@qwixl/shell-core";
import type { OwnerStore } from "@qwixl/owner-store";
import {
  PRESENTATION_BOARD_CATEGORY,
  PRESENTATION_BOARD_MUTE_LABEL,
  PRESENTATION_BOARD_STATE_LABEL,
  parsePresentationBoardState,
  parsePresentationBoardStateV2,
  type BoardRegion,
  type PresentationBoardState,
  type PresentationBoardStateV2,
} from "@qwixl/owner-store";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";
import { BoardTileFrame } from "./BoardTileFrame.js";
import {
  applyOwnerPin,
  applyOwnerReorder,
  applyOwnerSize,
  layoutBoardScreens,
  nextBoardTileSize,
} from "./boardLayout.js";

export const PRESENTATION_BOARD_MODULE_ID = "atom/presentation-board";

export function PresentationBoardPanel({
  catalog,
  registry,
  ownerStore,
  voiceMuted,
  onVoiceMutedChange,
  onClose,
}: {
  catalog: Catalog;
  registry: ModuleRegistry;
  ownerStore: OwnerStore;
  voiceMuted: boolean;
  onVoiceMutedChange: (muted: boolean) => void;
  onClose: () => void;
}) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [boardNow] = useState(() => Date.now());

  const boardRecord = useMemo(
    () =>
      ownerStore
        .list()
        .find(
          (record) =>
            record.category === PRESENTATION_BOARD_CATEGORY &&
            record.label === PRESENTATION_BOARD_STATE_LABEL,
        ),
    [ownerStore],
  );

  const v1State = useMemo(
    () => parsePresentationBoardState(boardRecord?.value),
    [boardRecord?.value],
  );

  const v2State = useMemo(
    () => parsePresentationBoardStateV2(boardRecord?.value),
    [boardRecord?.value],
  );

  const showV2Board = v2State.surfaces.length > 0;
  const showV1Module = !showV2Board && v1State.regions.length > 0;

  const persistV1 = useCallback(
    (next: PresentationBoardState) => {
      ownerStore.upsert({
        category: PRESENTATION_BOARD_CATEGORY,
        label: PRESENTATION_BOARD_STATE_LABEL,
        value: { ...next, updatedAt: Date.now() },
        guarded: false,
      });
    },
    [ownerStore],
  );

  const persistV2 = useCallback(
    (next: PresentationBoardStateV2) => {
      ownerStore.upsert({
        category: PRESENTATION_BOARD_CATEGORY,
        label: PRESENTATION_BOARD_STATE_LABEL,
        value: { ...next, updatedAt: Date.now() } as unknown as JsonValue,
        guarded: false,
      });
    },
    [ownerStore],
  );

  const boardScreens = useMemo(
    () => (showV2Board ? layoutBoardScreens(v2State.surfaces) : []),
    [showV2Board, v2State.surfaces],
  );

  const resolvedTiles = useMemo(() => {
    if (!showV2Board) return new Map();
    return new Map(
      v2State.surfaces.map((surface) => [
        surface.surfaceId,
        resolveComposition(surface.composition, catalog),
      ]),
    );
  }, [catalog, showV2Board, v2State.surfaces]);

  const updateSurface = useCallback(
    (surfaceId: string, updater: (surface: (typeof v2State.surfaces)[number]) => (typeof v2State.surfaces)[number]) => {
      persistV2({
        ...v2State,
        surfaces: v2State.surfaces.map((surface) =>
          surface.surfaceId === surfaceId ? updater(surface) : surface,
        ),
      });
    },
    [persistV2, v2State],
  );

  const dismissSurface = useCallback(
    (surfaceId: string) => {
      persistV2({
        ...v2State,
        surfaces: v2State.surfaces.filter((surface) => surface.surfaceId !== surfaceId),
        dismissed: [...v2State.dismissed, { surfaceId, at: Date.now() }],
      });
    },
    [persistV2, v2State],
  );

  const v1Props = useMemo(
    () => ({
      title: "Presentation board",
      subtitle: voiceMuted ? "Voice muted · text chat active" : "Voice mode · Mute for text chat",
      regions: v1State.regions,
      highlightId,
    }),
    [v1State.regions, highlightId, voiceMuted],
  );

  const onV1Event = useCallback(
    (name: string, payload: Record<string, unknown>) => {
      if (name === "boardPinToggled") {
        const id = typeof payload.id === "string" ? payload.id : "";
        const pinned = payload.pinned === true;
        if (!id) return;
        const regions: BoardRegion[] = v1State.regions.map((region) =>
          region.id === id ? { ...region, pinned } : region,
        );
        persistV1({ schemaVersion: 1, regions, updatedAt: Date.now() });
        return;
      }
      if (name === "boardRegionFocused") {
        const id = typeof payload.id === "string" ? payload.id : null;
        setHighlightId(id);
        return;
      }
      if (name === "boardRegionDismissed") {
        const id = typeof payload.id === "string" ? payload.id : "";
        if (!id) return;
        const regions = v1State.regions.filter((region) => region.id !== id || region.pinned);
        persistV1({ schemaVersion: 1, regions, updatedAt: Date.now() });
        if (highlightId === id) setHighlightId(null);
      }
    },
    [v1State.regions, persistV1, highlightId],
  );

  const onTileEvent = useCallback((event: UiEvent) => {
    void event;
  }, []);

  return (
    <section className="presentation-board-panel" aria-label="Presentation board">
      <header className="presentation-board-panel-header">
        <h2>Board</h2>
        <div className="presentation-board-panel-actions">
          <button
            type="button"
            className="chrome-approve"
            aria-pressed={voiceMuted}
            onClick={() => {
              const next = !voiceMuted;
              onVoiceMutedChange(next);
              ownerStore.upsert({
                category: PRESENTATION_BOARD_CATEGORY,
                label: PRESENTATION_BOARD_MUTE_LABEL,
                value: { muted: next },
                guarded: false,
              });
            }}
          >
            {voiceMuted ? "Unmute voice" : "Mute"}
          </button>
          <button type="button" className="chrome-reject" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      {showV2Board ? (
        <div className="board-screens" role="region" aria-label="Board screens">
          {boardScreens.map((screen) => (
            <section
              key={screen.screen}
              className="board-screen"
              aria-label={`Board screen ${screen.screen + 1}`}
            >
              <div className="board-screen-grid">
                {screen.tiles.map((tile) => {
                  const resolved = resolvedTiles.get(tile.surface.surfaceId);
                  if (!resolved) return null;
                  return (
                    <BoardTileFrame
                      key={tile.surface.surfaceId}
                      surface={tile.surface}
                      resolved={resolved}
                      placement={tile.placement}
                      now={boardNow}
                      onPin={(pinned) =>
                        updateSurface(tile.surface.surfaceId, (surface) => applyOwnerPin(surface, pinned))
                      }
                      onDismiss={() => dismissSurface(tile.surface.surfaceId)}
                      onResize={() =>
                        updateSurface(tile.surface.surfaceId, (surface) =>
                          applyOwnerSize(surface, nextBoardTileSize(tile.placement.size)),
                        )
                      }
                      onMoveEarlier={() =>
                        updateSurface(tile.surface.surfaceId, (surface) =>
                          applyOwnerReorder(
                            surface,
                            tile.placement.screen,
                            Math.max(0, tile.placement.order - 1),
                          ),
                        )
                      }
                      onMoveLater={() =>
                        updateSurface(tile.surface.surfaceId, (surface) =>
                          applyOwnerReorder(
                            surface,
                            tile.placement.screen,
                            tile.placement.order + 1,
                          ),
                        )
                      }
                      onEvent={onTileEvent}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {showV1Module ? (
        <CommsModuleEmbed
          moduleId={PRESENTATION_BOARD_MODULE_ID}
          catalog={catalog}
          registry={registry}
          props={v1Props}
          minHeight={360}
          onEvent={onV1Event}
        />
      ) : null}

      {!showV2Board && !showV1Module ? (
        <p className="board-empty">No board tiles yet.</p>
      ) : null}
    </section>
  );
}
