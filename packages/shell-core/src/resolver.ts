import type { Catalog, CatalogEntry } from "./catalog.js";
import type { Composition, CompositionNode } from "./types.js";

/**
 * A composition node after catalog resolution. Every node resolves to
 * something renderable — missing components degrade, never fail.
 */
export type ResolvedNode =
  | {
      kind: "component";
      node: CompositionNode;
      entry: CatalogEntry;
      children: ResolvedNode[];
    }
  | {
      /** Component missing but a core primitive shares its semantic role. */
      kind: "substituted";
      node: CompositionNode;
      entry: CatalogEntry;
      requested: string;
      children: ResolvedNode[];
    }
  | {
      /** Nothing matched; render plainly from semantic role + raw data. */
      kind: "fallback";
      node: CompositionNode;
      reason: "unknown-component" | "no-substitute";
      children: ResolvedNode[];
    };

export interface ResolvedSurface {
  surfaceId: string;
  intent?: string;
  root: ResolvedNode;
  /** True if any node fell back or was substituted (degraded rendering). */
  degraded: boolean;
}

export function resolveComposition(
  composition: Composition,
  catalog: Catalog,
): ResolvedSurface {
  let degraded = false;

  function resolveNode(node: CompositionNode): ResolvedNode {
    const children = (node.children ?? []).map(resolveNode);
    const entry = catalog.lookup(node.component);

    if (entry) {
      return { kind: "component", node, entry, children };
    }

    if (node.semanticRole) {
      const substitute = catalog.findCoreBySemanticRole(node.semanticRole);
      if (substitute) {
        degraded = true;
        return {
          kind: "substituted",
          node,
          entry: substitute,
          requested: node.component,
          children,
        };
      }
      degraded = true;
      return { kind: "fallback", node, reason: "no-substitute", children };
    }

    degraded = true;
    return { kind: "fallback", node, reason: "unknown-component", children };
  }

  const root = resolveNode(composition.root);
  return {
    surfaceId: composition.surfaceId,
    intent: composition.intent,
    root,
    degraded,
  };
}
