import { useCallback, useMemo, useState } from "react";
import type { Catalog, ModuleRegistry } from "@qwixl/shell-core";
import type { OwnerStore } from "@qwixl/owner-store";
import {
  PRESENTATION_BOARD_CATEGORY,
  PRESENTATION_BOARD_MUTE_LABEL,
  PRESENTATION_BOARD_STATE_LABEL,
  parsePresentationBoardState,
  type BoardRegion,
  type PresentationBoardState,
} from "@qwixl/owner-store";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";

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

  const state = useMemo(() => {
    const record = ownerStore
      .list()
      .find(
        (r) =>
          r.category === PRESENTATION_BOARD_CATEGORY && r.label === PRESENTATION_BOARD_STATE_LABEL,
      );
    return parsePresentationBoardState(record?.value);
  }, [ownerStore]);

  const persist = useCallback(
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

  const props = useMemo(
    () => ({
      title: "Presentation board",
      subtitle: voiceMuted ? "Voice muted · text chat active" : "Voice mode · Mute for text chat",
      regions: state.regions,
      highlightId,
    }),
    [state.regions, highlightId, voiceMuted],
  );

  const onEvent = useCallback(
    (name: string, payload: Record<string, unknown>) => {
      if (name === "boardPinToggled") {
        const id = typeof payload.id === "string" ? payload.id : "";
        const pinned = payload.pinned === true;
        if (!id) return;
        const regions: BoardRegion[] = state.regions.map((r) =>
          r.id === id ? { ...r, pinned } : r,
        );
        persist({ schemaVersion: 1, regions, updatedAt: Date.now() });
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
        const regions = state.regions.filter((r) => r.id !== id || r.pinned);
        persist({ schemaVersion: 1, regions, updatedAt: Date.now() });
        if (highlightId === id) setHighlightId(null);
      }
    },
    [state.regions, persist, highlightId],
  );

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
      <CommsModuleEmbed
        moduleId={PRESENTATION_BOARD_MODULE_ID}
        catalog={catalog}
        registry={registry}
        props={props}
        minHeight={360}
        onEvent={onEvent}
      />
    </section>
  );
}
