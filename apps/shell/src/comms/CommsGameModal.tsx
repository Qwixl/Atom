import type { Catalog, JsonObject, ModuleRegistry } from "@qwixl/shell-core";
import { CommsModuleEmbed } from "./CommsModuleEmbed.js";
import { IconClose } from "../shell/ShellIcons.js";
import { withModulePropDefaults } from "../chat/moduleEmbedDefaults.js";

type CommsGameModalProps = {
  title: string;
  moduleId: string;
  props: JsonObject;
  catalog: Catalog;
  registry: ModuleRegistry;
  peerBusy?: boolean;
  notice?: string | null;
  onClose: () => void;
  onEvent: (name: string, payload: Record<string, unknown>) => void;
};

/**
 * Peer/NPC game session overlay for Messages — same chrome as Chat GameModal,
 * but driven by A2A state rather than a chat feed surface.
 */
export function CommsGameModal({
  title,
  moduleId,
  props,
  catalog,
  registry,
  peerBusy = false,
  notice = null,
  onClose,
  onEvent,
}: CommsGameModalProps) {
  const resolvedProps = withModulePropDefaults(moduleId, props);
  const ended =
    resolvedProps.status === "won" ||
    resolvedProps.status === "draw" ||
    resolvedProps.phase === "won";

  return (
    <div
      className="chrome-overlay game-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comms-game-modal-title"
    >
      <div className="game-modal" onClick={(e) => e.stopPropagation()}>
        <header className="game-modal-header">
          <div>
            <p className="game-modal-eyebrow">Game session</p>
            <h2 id="comms-game-modal-title">{title}</h2>
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
            onEvent={(name, payload) => onEvent(name, (payload ?? {}) as Record<string, unknown>)}
          />
        </div>
        <p className="game-modal-footnote">
          {notice
            ? notice
            : peerBusy
              ? "Waiting for your opponent…"
              : ended
                ? "Game over — close to return to messages."
                : "Play in the modal — game moves stay out of the message thread."}
        </p>
      </div>
    </div>
  );
}
