import type { JsonObject, ResolvedNode, ResolvedSurface } from "@qwixl/shell-core";

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

/** Fill in required module props when the agent composition omits them. */
export function withModulePropDefaults(
  moduleId: string,
  props: JsonObject,
  options: { busyEvents?: Array<{ uid: string; summary: string; start: string; end: string }> } = {},
): JsonObject {
  if (moduleId === "games/tictactoe") {
    const hasBoard = props.board !== undefined;
    const hasStatus =
      props.status === "active" || props.status === "won" || props.status === "draw";
    if (!hasBoard && !hasStatus) {
      return {
        gameId: "ttt-chat",
        board: Array(9).fill(null),
        turn: "X",
        status: "active",
        myMark: "X",
        ...props,
      };
    }
  }
  if (moduleId === "games/battleships") {
    const hasPhase = props.phase === "setup" || props.phase === "battle" || props.phase === "won";
    if (!hasPhase && props._state === undefined) {
      return {
        gameId: "bs-chat",
        phase: "setup",
        size: 6,
        shipLengths: [2, 2, 2],
        totalShipCells: 6,
        turn: "owner",
        status: "active",
        ownerPlaced: false,
        agentPlaced: false,
        ownBoard: Array(36).fill("empty"),
        foeBoard: Array(36).fill("unknown"),
        foeHitsFound: 0,
        foeShipCells: 6,
        ...props,
      };
    }
  }
  if (moduleId === "scheduling/meeting-picker") {
    return {
      defaultTitle: "Meeting",
      busyEvents: options.busyEvents ?? [],
      ...props,
    };
  }
  if (moduleId === "atom/presentation-board") {
    return {
      title: "Presentation board",
      regions: Array.isArray(props.regions) ? props.regions : [],
      ...props,
    };
  }
  if (moduleId === "coordination/poll" && props.mode === undefined) {
    return { mode: "compose", ...props };
  }
  if (moduleId === "coordination/shared-list" && props.mode === undefined) {
    return { mode: "compose", ...props };
  }
  if (moduleId === "family/location-pin") {
    return {
      mode: props.mode === undefined ? "compose" : props.mode,
      defaultLabel: props.defaultLabel ?? "Meeting point",
      ...props,
    };
  }
  if (moduleId === "commerce/split-bill" && props.defaultLabel === undefined) {
    return { defaultLabel: "Split bill", ...props };
  }
  if (moduleId === "media/audio-player") {
    const src = String(props.src ?? props.enclosureUrl ?? props.url ?? "").trim();
    const description = props.description ?? props.summary;
    const feedLabel = props.feedLabel ?? props.feed;
    const publishedAt = props.publishedAt ?? props.pubDate;
    const mimeType = props.mimeType ?? props.enclosureType;
    return {
      ...props,
      title: props.title ?? props.label ?? "Podcast episode",
      ...(description !== undefined ? { description } : {}),
      ...(feedLabel !== undefined ? { feedLabel } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(src ? { src } : {}),
    };
  }
  return props;
}
