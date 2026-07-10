import type { Catalog, ModuleRegistry, ResolvedSurface, UiEvent } from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import type { ReactNode } from "react";
import { CommsModuleEmbed } from "../comms/CommsModuleEmbed.js";
import type { WebcalBusyEvent } from "../comms/icalExport.js";
import { GameFeedChip } from "./GameFeedChip.js";
import { isGameModule } from "./gameModules.js";
import { findModuleEmbed, withModulePropDefaults } from "./moduleEmbedDefaults.js";
import type { LinkIntentPayload } from "./linkIntent.js";
import { renderRichTextWithLinks } from "./renderRichText.js";

function minHeightForModule(moduleId: string): number {
  const shortViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px), (max-height: 700px)").matches;
  if (moduleId === "scheduling/meeting-picker") return shortViewport ? 240 : 300;
  if (moduleId === "games/battleships") return shortViewport ? 260 : 320;
  return shortViewport ? 120 : 160;
}

/** Agent-composed surfaces: registry modules use the same embed path as Messages. */
export function ChatFeedSurface({
  surface,
  catalog,
  registry,
  busyEvents = [],
  onEvent,
  onResumeGame,
  onLinkIntent,
}: {
  surface: ResolvedSurface;
  catalog: Catalog;
  registry: ModuleRegistry;
  busyEvents?: WebcalBusyEvent[];
  onEvent: (event: UiEvent) => void;
  onResumeGame?: () => void;
  onLinkIntent?: (payload: LinkIntentPayload) => void;
}) {
  const renderInlineText: ((text: string) => ReactNode) | undefined = onLinkIntent
    ? (text) => renderRichTextWithLinks(text, onLinkIntent)
    : undefined;
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
      <SurfaceRenderer surface={surface} onEvent={onEvent} renderInlineText={renderInlineText} />
    </div>
  );
}

