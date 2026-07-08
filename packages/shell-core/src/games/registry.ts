import type { GameEngine } from "./engine.js";
import { BattleshipsEngine } from "./battleships.js";
import { TictactoeEngine } from "./tictactoe.js";

// Erased generics: the map stores engines behind the untyped facade; hosts
// interact through parseMove/applyMove which validate at runtime.
const engines = new Map<string, GameEngine>([
  ["games/tictactoe", new TictactoeEngine() as unknown as GameEngine],
  ["games/battleships", new BattleshipsEngine() as unknown as GameEngine],
]);

/** Engine for a game module id, or null when the module has no shell engine. */
export function getGameEngine(moduleId: string): GameEngine | null {
  return engines.get(moduleId) ?? null;
}

/** Register an engine (module ecosystem: engines can ship beside modules). */
export function registerGameEngine(engine: GameEngine): void {
  engines.set(engine.moduleId, engine);
}
