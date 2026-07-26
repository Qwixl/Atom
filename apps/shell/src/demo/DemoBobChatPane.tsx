import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { SchedulingSlot } from "@qwixl/a2a-transport";
import { AgUiAgentSession } from "@qwixl/ag-ui-adapter";
import {
  Catalog,
  ConversationRuntime,
  ModuleRegistry,
  registerCorePrimitives,
  registerEcosystemModules,
  type Composition,
  type CompositionNode,
  type UiEvent,
} from "@qwixl/shell-core";
import { agUiAuthHeaders, agUiUrlFromAgentAdminUrl } from "../agUiConfig.js";
import { ChatFeedSurface } from "../chat/ChatFeedSurface.js";
import { findModuleEmbed } from "../chat/moduleEmbedDefaults.js";
import { PRODUCTION_REGISTRY_TRUST, PRODUCTION_REGISTRY_URL } from "../hostConfig.js";

export type DemoBobProposalNotice = {
  proposalId: string;
  title: string;
  slots: SchedulingSlot[];
};

/** Keep meeting-confirm props grounded in the A2A proposal (models may drift labels/times). */
function groundMeetingConfirmProps(composition: Composition, proposal: DemoBobProposalNotice): void {
  const walk = (node: CompositionNode) => {
    if (node.component === "scheduling/meeting-confirm") {
      node.props = {
        ...(node.props ?? {}),
        title: proposal.title,
        slots: proposal.slots,
      };
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(composition.root);
}

export type DemoBobChatPaneHandle = {
  notifyProposal: (proposal: DemoBobProposalNotice) => void;
};

export const DemoBobChatPane = forwardRef<
  DemoBobChatPaneHandle,
  {
    bobAdminUrl: string;
    bobAdminToken: string;
    busyOutbound: boolean;
    onMeetingResponse: (
      proposalId: string,
      response: "accept" | "decline",
      slot?: SchedulingSlot,
    ) => void | Promise<void>;
    onConfirmVisible?: () => void;
  }
>(function DemoBobChatPane(
  { bobAdminUrl, bobAdminToken, busyOutbound, onMeetingResponse, onConfirmVisible },
  ref,
) {
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
        url: agUiUrlFromAgentAdminUrl(bobAdminUrl),
        headers: agUiAuthHeaders(bobAdminToken),
      }),
    [bobAdminToken, bobAdminUrl],
  );

  const inboundProposalRef = useRef<DemoBobProposalNotice | null>(null);

  const conversation = useMemo(
    () =>
      new ConversationRuntime({
        catalog,
        beforeResolveComposition: async (composition) => {
          await registry.ensureModules(catalog, composition);
          const proposal = inboundProposalRef.current;
          if (proposal) groundMeetingConfirmProps(composition, proposal);
        },
      }),
    [catalog, registry],
  );

  useLayoutEffect(() => {
    conversation.bindSession(session);
  }, [conversation, session]);

  useEffect(() => {
    void registry.ensureModule(catalog, "scheduling/meeting-confirm").catch(() => {});
  }, [catalog, registry]);

  const snapshot = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.getSnapshot(),
    () => conversation.getSnapshot(),
  );

  const feedRef = useRef<HTMLDivElement>(null);
  const activeProposalIdRef = useRef<string | null>(null);
  const notifiedRef = useRef<string | null>(null);
  const confirmSeenRef = useRef(false);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [snapshot.feed, snapshot.busy]);

  useEffect(() => {
    if (confirmSeenRef.current) return;
    const hasConfirm = snapshot.feed.some(
      (item) =>
        item.kind === "surface" && findModuleEmbed(item.surface)?.moduleId === "scheduling/meeting-confirm",
    );
    if (hasConfirm) {
      confirmSeenRef.current = true;
      onConfirmVisible?.();
    }
  }, [onConfirmVisible, snapshot.feed]);

  useImperativeHandle(ref, () => ({
    notifyProposal(proposal: DemoBobProposalNotice) {
      if (notifiedRef.current === proposal.proposalId) return;
      notifiedRef.current = proposal.proposalId;
      activeProposalIdRef.current = proposal.proposalId;
      inboundProposalRef.current = proposal;
      const slotLines = proposal.slots
        .map(
          (slot, index) =>
            `${index + 1}. id=${slot.id}; label=${slot.label}; start=${slot.start}; end=${slot.end}`,
        )
        .join("\n");
      const text =
        `Inbound scheduling proposal from Alice's agent.\n` +
        `proposalId=${proposal.proposalId}\n` +
        `title=${proposal.title}\n` +
        `slots:\n${slotLines}\n` +
        `Compose scheduling/meeting-confirm with these exact title and slots so I can accept or decline.`;
      conversation.appendUser("New meeting proposal from Alice");
      session.sendUserMessage(text);
    },
  }));

  function handleUiEvent(event: UiEvent) {
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : undefined;

    if (event.name === "meetingResponse") {
      const proposalId = activeProposalIdRef.current;
      if (!proposalId) return;
      const response = payload?.response === "decline" ? "decline" : "accept";
      const slot =
        payload?.slot && typeof payload.slot === "object"
          ? (payload.slot as SchedulingSlot)
          : undefined;
      conversation.setBusy(true);
      void Promise.resolve(onMeetingResponse(proposalId, response, slot)).finally(() => {
        conversation.appendLocalAgentText(
          response === "accept"
            ? "Accepted — Alice’s Activity will update with the reply."
            : "Declined — Alice’s Activity will update with the reply.",
        );
        conversation.setBusy(false);
      });
      return;
    }

    conversation.setBusy(true);
    session.sendUiEvent(event);
  }

  return (
    <div className="demo-bob-chat" data-demo-target="bob-chat">
      <div className="demo-alice-chat-feed" ref={feedRef}>
        {snapshot.feed.length === 0 ? (
          <div className="demo-alice-chat-empty">
            <p>Waiting for Alice’s agent to send a proposal. Bob’s agent will build a confirmation here.</p>
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
              <div key={item.id} data-demo-target="bob-confirm">
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
        {snapshot.busy || busyOutbound ? (
          <div className="feed-busy">Bob’s agent working…</div>
        ) : null}
      </div>
    </div>
  );
});
