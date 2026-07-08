import type { Composition, CompositionNode, JsonObject } from "../types.js";
import type { FeedItem } from "../conversation.js";
import { findActiveGameInFeed, isGameEnded } from "./feed.js";
import { getGameEngine } from "./registry.js";

function findGameNode(root: CompositionNode): CompositionNode | null {
  const engine = getGameEngine(root.component);
  if (engine) return root;
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
 * the agent must not emit a **new game** composition. Non-game surfaces
 * (core/card, scheduling modules, etc.) are always allowed — upsertFeedSurface
 * replaces the prior surface. Mid-game the agent's game channel is game-move.
 */
export function allowCompositionDuringGame(
  composition: Composition,
  feed: readonly FeedItem[],
): boolean {
  if (!gameModuleInComposition(composition.root)) return true;
  const active = findActiveGameInFeed(feed);
  if (!active) return true;
  return isGameEnded(active.embed.props);
}

/** Agent-facing view of the active game (compiled into the system prompt). */
export function activeGameContext(active: ReturnType<typeof findActiveGameInFeed>) {
  if (!active) return undefined;
  const engine = getGameEngine(active.embed.moduleId);
  const props = active.embed.props;
  return {
    surfaceId: active.surface.surfaceId,
    component: active.embed.moduleId,
    intent: active.surface.intent,
    props: engine ? engine.agentView(engine.fromProps(props)) : props,
  };
}
