import type { FeedItem } from "../conversation.js";
import type { ResolvedNode, ResolvedSurface } from "../resolver.js";
import type { JsonObject } from "../types.js";
import { getGameEngine } from "./registry.js";

export interface ModuleEmbedTarget {
  moduleId: string;
  nodeId: string;
  props: JsonObject;
}

function walkForModule(node: ResolvedNode): ModuleEmbedTarget | null {
  if (node.kind === "component" && node.entry.origin === "module") {
    return {
      moduleId: node.entry.spec.moduleId ?? node.node.component,
      nodeId: node.node.id,
      props: (node.node.props ?? {}) as JsonObject,
    };
  }
  for (const child of node.children) {
    const found = walkForModule(child);
    if (found) return found;
  }
  return null;
}

/** First registry module in a surface tree (root or nested under core/card). */
export function findModuleEmbed(surface: ResolvedSurface): ModuleEmbedTarget | null {
  return walkForModule(surface.root);
}

/** True when a shell-side GameEngine is registered for this module id. */
export function isGameModule(moduleId: string): boolean {
  return getGameEngine(moduleId) !== null;
}

export function isGameEnded(props: JsonObject): boolean {
  return props.status === "won" || props.status === "draw";
}

/** True when the feed has an in-progress shell-arbitrated game surface. */
export function isActiveShellGameOnFeed(feed: readonly FeedItem[]): boolean {
  const active = findActiveGameInFeed(feed);
  if (!active) return false;
  return !isGameEnded(active.embed.props);
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

/** Recover engine state from persisted module props. */
export function gameStateFromProps(moduleId: string, props: JsonObject): unknown | null {
  const engine = getGameEngine(moduleId);
  return engine ? engine.fromProps(props) : null;
}
