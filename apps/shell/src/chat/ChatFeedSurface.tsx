import type { Catalog, ModuleRegistry, ResolvedSurface, UiEvent } from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";
import type { WebcalBusyEvent } from "../comms/icalExport.js";
import { GameFeedChip } from "./GameFeedChip.js";
import { isGameModule } from "./gameModules.js";
import { findModuleEmbed, withModulePropDefaults } from "./moduleEmbedDefaults.js";

function minHeightForModule(moduleId: string): number {
  if (moduleId === "scheduling/meeting-picker") return 300;
  return 160;
}

/** Agent-composed surfaces: registry modules use the same embed path as Messages. */
export function ChatFeedSurface({
  surface,
  catalog,
  registry,
  busyEvents = [],
  onEvent,
  onResumeGame,
}: {
  surface: ResolvedSurface;
  catalog: Catalog;
  registry: ModuleRegistry;
  busyEvents?: WebcalBusyEvent[];
  onEvent: (event: UiEvent) => void;
  onResumeGame?: () => void;
}) {
  const embed = findModuleEmbed(surface);
  if (embed) {
    if (isGameModule(embed.moduleId)) {
      return (
        <GameFeedChip
          surface={surface}
          moduleId={embed.moduleId}
          props={embed.props}
          onResume={() => onResumeGame?.()}
        />
      );
    }

    const props = withModulePropDefaults(embed.moduleId, embed.props, { busyEvents });
    return (
      <div className="feed-surface feed-surface--module">
        <CommsModuleEmbed
          moduleId={embed.moduleId}
          catalog={catalog}
          registry={registry}
          props={props}
          minHeight={minHeightForModule(embed.moduleId)}
          onEvent={(name, payload) =>
            onEvent({
              surfaceId: surface.surfaceId,
              nodeId: embed.nodeId,
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
