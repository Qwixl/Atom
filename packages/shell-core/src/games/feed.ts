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
    const component = node.node.component;
    const moduleId =
      isGameModule(component) || getGameEngine(node.entry.spec.moduleId ?? "")
        ? (node.entry.spec.moduleId ?? component)
        : component;
    return {
      moduleId,
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

/** True when a surface hosts a live game module (single active instance, in-place updates). */
export function isInteractiveSurface(surface: ResolvedSurface): boolean {
  const embed = findModuleEmbed(surface);
  return embed !== null && isGameModule(embed.moduleId);
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
    if (item?.kind !== "surface") continue;
    const embed = findModuleEmbed(item.surface);
    if (embed && isGameModule(embed.moduleId)) {
      return { surface: item.surface, embed };
    }
  }
  return null;
}

/** Recover engine state from persisted module props. */
export function gameStateFromProps(moduleId: string, props: JsonObject): unknown | null {
  const engine = getGameEngine(moduleId);
  return engine ? engine.fromProps(props) : null;
}
