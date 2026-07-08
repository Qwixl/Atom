import { getGameEngine, type Composition } from "@qwixl/shell-core";
import { gameModuleLabel } from "./gameModules.js";

/** Shell-owned composition to start a registered game module (sanitized by the engine). */
export function buildGameStartComposition(moduleId: string): Composition {
  const engine = getGameEngine(moduleId);
  if (!engine) {
    throw new Error(`No shell game engine for ${moduleId}`);
  }
  const label = gameModuleLabel(moduleId);
  const slug = moduleId.includes("/") ? moduleId.slice(moduleId.lastIndexOf("/") + 1) : moduleId;
  const surfaceId = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  const events: string[] = [];
  if (engine.uiEvents?.restart) events.push(engine.uiEvents.restart);
  if (engine.uiEvents?.move) events.push(engine.uiEvents.move);
  return {
    version: 1,
    surfaceId,
    intent: `${label} game`,
    root: {
      id: `${slug}-board`,
      component: moduleId,
      semanticRole: "input/game-board",
      props: {},
      events,
    },
  };
}
