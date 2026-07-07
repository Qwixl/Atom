import type { FeedItem, ResolvedSurface } from "@qwixl/shell-core";
import { findModuleEmbed, type ModuleEmbedTarget } from "./moduleEmbedDefaults.js";

const GAME_MODULE_IDS = new Set(["games/tictactoe", "games/battleships"]);

export function isGameModule(moduleId: string): boolean {
  return GAME_MODULE_IDS.has(moduleId);
}

export function gameModuleLabel(moduleId: string): string {
  if (moduleId === "games/tictactoe") return "Tic-tac-toe";
  if (moduleId === "games/battleships") return "Battleships";
  return "Game";
}

export function isGameEnded(props: Record<string, unknown>): boolean {
  return props.status === "won" || props.status === "draw";
}

export interface ActiveChatGame {
  surface: ResolvedSurface;
  embed: ModuleEmbedTarget;
}

/** Active game surface on the chat feed (shell keeps one surface). */
export function findActiveGameInFeed(feed: readonly FeedItem[]): ActiveChatGame | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (item?.kind === "surface") {
      const embed = findModuleEmbed(item.surface);
      if (embed && isGameModule(embed.moduleId)) {
        return { surface: item.surface, embed };
      }
      return null;
    }
  }
  return null;
}
