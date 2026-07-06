import type { Catalog, ModuleRegistry, ResolvedSurface, UiEvent } from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";

function moduleIdFromSurface(surface: ResolvedSurface): string | null {
  const root = surface.root;
  if (root.kind === "component" && root.entry.origin === "module") {
    return root.entry.spec.moduleId ?? root.node.component;
  }
  return null;
}

function minHeightForModule(moduleId: string): number {
  if (moduleId === "games/tictactoe") return 220;
  if (moduleId === "games/battleships") return 300;
  if (moduleId === "scheduling/meeting-picker") return 120;
  return 160;
}

/** Agent-composed surfaces: registry modules use the same embed path as Messages. */
export function ChatFeedSurface({
  surface,
  catalog,
  registry,
  onEvent,
}: {
  surface: ResolvedSurface;
  catalog: Catalog;
  registry: ModuleRegistry;
  onEvent: (event: UiEvent) => void;
}) {
  const moduleId = moduleIdFromSurface(surface);
  if (moduleId) {
    const props = (surface.root.node.props ?? {}) as Record<string, unknown>;
    return (
      <div className="feed-surface feed-surface--module">
        <CommsModuleEmbed
          moduleId={moduleId}
          catalog={catalog}
          registry={registry}
          props={props}
          minHeight={minHeightForModule(moduleId)}
          onEvent={(name, payload) =>
            onEvent({
              surfaceId: surface.surfaceId,
              nodeId: surface.root.node.id,
              name,
              payload: payload as import("@qwixl/shell-core").JsonValue,
              timestamp: Date.now(),
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="feed-surface">
      {surface.degraded ? <div className="feed-surface-degraded">degraded rendering</div> : null}
      <SurfaceRenderer surface={surface} onEvent={onEvent} />
    </div>
  );
}
