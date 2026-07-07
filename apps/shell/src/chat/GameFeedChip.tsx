import type { ResolvedSurface } from "@qwixl/shell-core";
import { gameModuleLabel, isGameEnded } from "./gameModules.js";
import { withModulePropDefaults } from "./moduleEmbedDefaults.js";

export function GameFeedChip({
  surface,
  moduleId,
  props,
  onResume,
}: {
  surface: ResolvedSurface;
  moduleId: string;
  props: Record<string, unknown>;
  onResume: () => void;
}) {
  const resolved = withModulePropDefaults(moduleId, props);
  const ended = isGameEnded(resolved);
  const title = surface.intent?.trim() || gameModuleLabel(moduleId);

  return (
    <div className="feed-surface feed-surface--game-chip">
      <div className="feed-game-chip-inner">
        <div>
          <p className="feed-game-chip-label">{gameModuleLabel(moduleId)}</p>
          <p className="feed-game-chip-title">{title}</p>
          <p className="feed-game-chip-status">
            {ended ? "Game finished — close to return to chat." : "Playing in game view"}
          </p>
        </div>
        {!ended ? (
          <button type="button" className="shell-btn shell-btn-secondary" onClick={onResume}>
            Open game
          </button>
        ) : null}
      </div>
    </div>
  );
}
