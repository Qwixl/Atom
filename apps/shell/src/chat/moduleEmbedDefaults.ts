import type { ResolvedNode, ResolvedSurface } from "@qwixl/shell-core";

export interface ModuleEmbedTarget {
  moduleId: string;
  nodeId: string;
  props: Record<string, unknown>;
}

function walkForModule(node: ResolvedNode): ModuleEmbedTarget | null {
  if (node.kind === "component" && node.entry.origin === "module") {
    return {
      moduleId: node.entry.spec.moduleId ?? node.node.component,
      nodeId: node.node.id,
      props: (node.node.props ?? {}) as Record<string, unknown>,
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
  props: Record<string, unknown>,
): Record<string, unknown> {
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
  if (moduleId === "scheduling/meeting-picker") {
    return { defaultTitle: "Meeting", ...props };
  }
  if (moduleId === "coordination/poll" && props.mode === undefined) {
    return { mode: "compose", ...props };
  }
  if (moduleId === "coordination/shared-list" && props.mode === undefined) {
    return { mode: "compose", ...props };
  }
  return props;
}
