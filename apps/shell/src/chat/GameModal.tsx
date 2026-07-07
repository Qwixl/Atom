import type { Catalog, JsonObject, ModuleRegistry, ResolvedSurface, UiEvent } from "@qwixl/shell-core";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";
import { IconClose } from "../shell/ShellIcons.js";
import { gameModuleLabel, isGameEnded } from "./gameModules.js";
import { withModulePropDefaults } from "./moduleEmbedDefaults.js";

type GameModalProps = {
  surface: ResolvedSurface;
  moduleId: string;
  nodeId: string;
  props: JsonObject;
  catalog: Catalog;
  registry: ModuleRegistry;
  agentBusy?: boolean;
  /** Shell-only notice (e.g. disclosed fallback move) — shown in modal, not chat. */
  notice?: string | null;
  onClose: () => void;
  onEvent: (event: UiEvent) => void;
};

export function GameModal({
  surface,
  moduleId,
  nodeId,
  props,
  catalog,
  registry,
  agentBusy = false,
  notice = null,
  onClose,
  onEvent,
}: GameModalProps) {
  const resolvedProps = withModulePropDefaults(moduleId, props);
  const title = surface.intent?.trim() || gameModuleLabel(moduleId);
  const ended = isGameEnded(resolvedProps);

  return (
    <div
      className="chrome-overlay game-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
    >
      <div className="game-modal" onClick={(e) => e.stopPropagation()}>
        <header className="game-modal-header">
          <div>
            <p className="game-modal-eyebrow">Game session</p>
            <h2 id="game-modal-title">{title}</h2>
          </div>
          <button type="button" className="chrome-dialog-close" aria-label="Close game" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="game-modal-body">
          <CommsModuleEmbed
            moduleId={moduleId}
            catalog={catalog}
            registry={registry}
            props={resolvedProps}
            minHeight={440}
            className="game-modal-iframe"
            onEvent={(name, payload) =>
              onEvent({
                surfaceId: surface.surfaceId,
                nodeId,
                name,
                payload: payload as import("@qwixl/shell-core").JsonValue,
                timestamp: Date.now(),
              })
            }
          />
        </div>
        <p className="game-modal-footnote">
          {notice
            ? notice
            : agentBusy
              ? "Your agent is choosing a move…"
              : ended
                ? "Game over — play again or close to return to chat."
                : "Play in the modal — game moves stay out of chat."}
        </p>
      </div>
    </div>
  );
}
