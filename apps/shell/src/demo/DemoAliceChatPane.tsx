import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SchedulingSlot } from "@qwixl/a2a-transport";
import { AgUiAgentSession } from "@qwixl/ag-ui-adapter";
import {
  Catalog,
  ConversationRuntime,
  ModuleRegistry,
  registerCorePrimitives,
  registerEcosystemModules,
  type UiEvent,
} from "@qwixl/shell-core";
import { agUiAuthHeaders, agUiUrlFromAgentAdminUrl } from "../agUiConfig.js";
import { ChatFeedSurface } from "../chat/ChatFeedSurface.js";
import { findModuleEmbed } from "../chat/moduleEmbedDefaults.js";
import { PRODUCTION_REGISTRY_TRUST, PRODUCTION_REGISTRY_URL } from "../hostConfig.js";
import { resizeTextareaToContent } from "../ui/resizeTextareaToContent.js";

const SUGGESTED_PROMPT = "Schedule a meeting with Bob next week";

export function DemoAliceChatPane({
  peerName,
  aliceAdminUrl,
  aliceAdminToken,
  busyOutbound,
  onMeetingProposed,
  onPickerVisible,
  onUserAsked,
}: {
  peerName: string;
  aliceAdminUrl: string;
  aliceAdminToken: string;
  busyOutbound: boolean;
  onMeetingProposed: (title: string, slots: SchedulingSlot[]) => void | Promise<void>;
  onPickerVisible?: () => void;
  onUserAsked?: () => void;
}) {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    registerEcosystemModules(c);
    return c;
  }, []);

  const registry = useMemo(
    () =>
      new ModuleRegistry({
        indexUrl: PRODUCTION_REGISTRY_URL,
        trust: PRODUCTION_REGISTRY_TRUST,
      }),
    [],
  );

  const session = useMemo(
    () =>
      new AgUiAgentSession({
        url: agUiUrlFromAgentAdminUrl(aliceAdminUrl),
        headers: agUiAuthHeaders(aliceAdminToken),
      }),
    [aliceAdminToken, aliceAdminUrl],
  );

  const conversation = useMemo(
    () =>
      new ConversationRuntime({
        catalog,
        beforeResolveComposition: async (composition) => {
          await registry.ensureModules(catalog, composition);
        },
      }),
    [catalog, registry],
  );

  useLayoutEffect(() => {
    conversation.bindSession(session);
  }, [conversation, session]);

  useEffect(() => {
    void registry.ensureModule(catalog, "scheduling/meeting-picker").catch(() => {
      /* ChatFeedSurface will surface load errors */
    });
  }, [catalog, registry]);

  const snapshot = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.getSnapshot(),
    () => conversation.getSnapshot(),
  );

  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const pickerSeenRef = useRef(false);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [snapshot.feed, snapshot.busy]);

  useEffect(() => {
    if (pickerSeenRef.current) return;
    const hasPicker = snapshot.feed.some(
      (item) =>
        item.kind === "surface" && findModuleEmbed(item.surface)?.moduleId === "scheduling/meeting-picker",
    );
    if (hasPicker) {
      pickerSeenRef.current = true;
      onPickerVisible?.();
    }
  }, [onPickerVisible, snapshot.feed]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) resizeTextareaToContent(el);
  }, [draft]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || snapshot.busy || busyOutbound) return;
    conversation.appendUser(trimmed);
    session.sendUserMessage(trimmed);
    setDraft("");
    onUserAsked?.();
  }

  function handleUiEvent(event: UiEvent) {
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : undefined;

    if (event.name === "meetingProposed") {
      const title = typeof payload?.title === "string" ? payload.title : `Meeting with ${peerName}`;
      const slots = Array.isArray(payload?.slots) ? (payload.slots as SchedulingSlot[]) : [];
      if (slots.length === 0) return;
      conversation.setBusy(true);
      void Promise.resolve(onMeetingProposed(title, slots)).finally(() => {
        conversation.appendLocalAgentText(
          `Sending “${title}” to ${peerName}’s agent now — watch the inbox on the right.`,
        );
        conversation.setBusy(false);
      });
      return;
    }

    conversation.setBusy(true);
    session.sendUiEvent(event);
  }

  return (
    <div className="demo-alice-chat" data-demo-target="alice-chat">
      <div className="demo-alice-chat-feed" data-demo-target="alice-feed" ref={feedRef}>
        {snapshot.feed.length === 0 ? (
          <div className="demo-alice-chat-empty">
            <p>
              Ask Alice to schedule a meeting with {peerName}. Her agent asks for anything missing,
              then builds a picker you can edit before sending agent-to-agent.
            </p>
            <button
              type="button"
              className="demo-ask-chip"
              data-demo-target="ask"
              disabled={snapshot.busy || busyOutbound}
              onClick={() => submit(SUGGESTED_PROMPT)}
            >
              {SUGGESTED_PROMPT}
            </button>
          </div>
        ) : (
          snapshot.feed.map((item) => {
            if (item.kind === "user") {
              return (
                <div key={item.id} className="feed-user demo-feed-user">
                  {item.text}
                </div>
              );
            }
            if (item.kind === "agent-text") {
              return (
                <div key={item.id} className="feed-agent demo-feed-agent">
                  {item.text}
                </div>
              );
            }
            return (
              <div key={item.id} data-demo-target="picker">
                <ChatFeedSurface
                  surface={item.surface}
                  catalog={catalog}
                  registry={registry}
                  onEvent={handleUiEvent}
                />
              </div>
            );
          })
        )}
        {snapshot.busy ? <div className="feed-busy">Alice’s agent working…</div> : null}
      </div>

      <footer className="demo-alice-composer" data-demo-target="ask-compose">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={snapshot.busy || busyOutbound}
          aria-label="Message to Alice’s agent"
          placeholder="Ask Alice to arrange a meeting…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit(draft);
            }
          }}
        />
        <button
          type="button"
          className="shell-btn shell-btn-primary"
          disabled={!draft.trim() || snapshot.busy || busyOutbound}
          onClick={() => submit(draft)}
        >
          Ask
        </button>
      </footer>
    </div>
  );
}
