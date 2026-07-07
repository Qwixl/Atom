import type { Composition, CompositionNode, FeedItem, JsonObject } from "@qwixl/shell-core";
import { getGameEngine } from "@qwixl/shell-core";
import { findActiveGameInFeed, isGameEnded, isGameModule } from "./gameModules.js";

function findGameNode(root: CompositionNode): CompositionNode | null {
  if (isGameModule(root.component)) return root;
  for (const child of root.children ?? []) {
    const found = findGameNode(child);
    if (found) return found;
  }
  return null;
}

export function gameModuleInComposition(root: CompositionNode): string | null {
  return findGameNode(root)?.component ?? null;
}

/**
 * A composition that starts a game always starts from the engine's initial
 * state — the agent's props are advisory. The engine, not the model, is the
 * bookkeeper (see Gaming Framework docs).
 */
export function sanitizeNewGameComposition(composition: Composition): void {
  const node = findGameNode(composition.root);
  if (!node) return;
  const engine = getGameEngine(node.component);
  if (!engine) return;
  node.props = { ...(node.props ?? {}), ...engine.toProps(engine.initialState()) };
}

/**
 * While a game is active the feed surface belongs to the game engine:
 * no agent composition may replace or rewrite it. Mid-game the agent's
 * only channel is game-move; new compositions are allowed again once the
 * game has ended.
 */
export function allowCompositionDuringGame(
  _composition: Composition,
  feed: readonly FeedItem[],
): boolean {
  const active = findActiveGameInFeed(feed);
  if (!active) return true;
  return isGameEnded(active.embed.props as Record<string, unknown>);
}

/** Agent-facing view of the active game (compiled into the system prompt). */
export function activeGameContext(active: ReturnType<typeof findActiveGameInFeed>) {
  if (!active) return undefined;
  const engine = getGameEngine(active.embed.moduleId);
  const props = active.embed.props as JsonObject;
  return {
    surfaceId: active.surface.surfaceId,
    component: active.embed.moduleId,
    intent: active.surface.intent,
    props: engine ? engine.agentView(engine.fromProps(props)) : props,
  };
}
