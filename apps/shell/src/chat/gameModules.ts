import { findActiveGameInFeed, isGameEnded, isGameModule } from "@qwixl/shell-core";

export { findActiveGameInFeed, isGameEnded, isGameModule };

export type { ActiveChatGame } from "@qwixl/shell-core";

export function gameModuleLabel(moduleId: string): string {
  if (moduleId === "games/tictactoe") return "Tic-tac-toe";
  if (moduleId === "games/battleships") return "Battleships";
  return "Game";
}
