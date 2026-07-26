import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SchedulingSlot } from "@qwixl/a2a-transport";
import type { ConsequentialAction } from "@qwixl/shell-core";
import {
  ThreadItemView,
  threadItemNeedsActions,
  useRespondedProposalIds,
  useRespondedTransactionIds,
} from "./comms/CoordinationCard.js";
import { CommsAgentClient } from "./comms/client.js";
import { agentJsonRpcEndpoint, resolveAgentDeliveryBase } from "./comms/agentDeliveryUrl.js";
import { mergeThread } from "./comms/coordinationThread.js";
import type { CommsThreadItem, InboxEntryWire } from "./comms/types.js";
import { DemoProposalComposer } from "./DemoProposalComposer.js";
import { DEMO_PERSONAS } from "./demoPersonas.js";
import { DemoAliceChatPane } from "./demo/DemoAliceChatPane.js";
import { DemoBobChatPane, type DemoBobChatPaneHandle } from "./demo/DemoBobChatPane.js";
import {
  DemoCoach,
  nextCoachAfterAccept,
  nextCoachAfterAsk,
  nextCoachAfterPicker,
  nextCoachAfterSend,
  type DemoCoachStep,
} from "./demo/DemoCoach.js";
import { DemoExploreCopy } from "./demo/DemoExploreCopy.js";

const POLL_MS = 2000;

export type DemoPairAgent = {
  label: string;
  adminUrl: string;
  adminToken: string;
  /** Server-reachable URL for peer agents to deliver A2A (not /agent-api). */
  deliveryBase?: string;
};

type CommsConfirmationResult =
  | { decision: "declined" }
  | { decision: "approved"; attestationRef: string; approvalRef: string };

type DemoPairViewProps = {
  onRequestConfirmation: (action: ConsequentialAction) => Promise<CommsConfirmationResult>;
  alice?: DemoPairAgent;
  bob?: DemoPairAgent;
  showIntro?: boolean;
  /** Interactive coach overlays for the public live demo. */
  guided?: boolean;
};

function deliveryBaseFor(agent: DemoPairAgent): string {
  return agent.deliveryBase ?? resolveAgentDeliveryBase(agent.adminUrl);
}

function missionPhase(step: DemoCoachStep | null): "ask" | "build" | "bob" | "done" {
  if (!step || step === "welcome" || step === "ask") return "ask";
  if (step === "build") return "build";
  if (step === "bob") return "bob";
  return "done";
}

export function DemoPairView({
  onRequestConfirmation,
  alice = DEMO_PERSONAS.alice,
  bob = DEMO_PERSONAS.bob,
  showIntro = true,
  guided = false,
}: DemoPairViewProps) {
  const aliceDelivery = deliveryBaseFor(alice);
  const bobDelivery = deliveryBaseFor(bob);

  const aliceClient = useMemo(
    () => new CommsAgentClient(alice.adminUrl, alice.adminToken),
    [alice.adminToken, alice.adminUrl],
  );
  const bobClient = useMemo(
    () => new CommsAgentClient(bob.adminUrl, bob.adminToken),
    [bob.adminToken, bob.adminUrl],
  );

  const [aliceDid, setAliceDid] = useState<string | null>(null);
  const [bobDid, setBobDid] = useState<string | null>(null);
  const [aliceInbox, setAliceInbox] = useState<InboxEntryWire[]>([]);
  const [bobInbox, setBobInbox] = useState<InboxEntryWire[]>([]);
  const [aliceOutbound, setAliceOutbound] = useState<CommsThreadItem[]>([]);
  const [bobOutbound, setBobOutbound] = useState<CommsThreadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [coachStep, setCoachStep] = useState<DemoCoachStep | null>(guided ? "welcome" : null);
  /** Object id of the proposal sent in this guided run — ignores leftover Bob inbox noise. */
  const [sentProposalId, setSentProposalId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(!guided);
  const bobChatRef = useRef<DemoBobChatPaneHandle>(null);
  const bobNotifiedRef = useRef<string | null>(null);

  const aliceEndpoint = agentJsonRpcEndpoint(aliceDelivery);
  const bobEndpoint = agentJsonRpcEndpoint(bobDelivery);

  const refresh = useCallback(async () => {
    try {
      const [aHealth, bHealth, aInbox, bInbox] = await Promise.all([
        aliceClient.health(),
        bobClient.health(),
        aliceClient.inbox(),
        bobClient.inbox(),
      ]);
      setAliceDid(aHealth.did);
      setBobDid(bHealth.did);
      setAliceInbox(aInbox);
      setBobInbox(bInbox);
    } catch {
      /* agents may still be starting */
    }
  }, [aliceClient, bobClient]);

  // Guided demo: wipe both agent inboxes on every load so nothing is retained.
  useEffect(() => {
    if (!guided) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([aliceClient.clearInbox(), bobClient.clearInbox()]);
      } catch {
        /* older agents without DELETE /inbox — still continue */
      }
      if (cancelled) return;
      setAliceOutbound([]);
      setBobOutbound([]);
      setSentProposalId(null);
      setAliceInbox([]);
      setBobInbox([]);
      setSessionReady(true);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [aliceClient, bobClient, guided, refresh]);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, sessionReady]);

  const aliceThread = useMemo(() => {
    if (!bobDid) return [];
    return mergeThread(aliceInbox, aliceOutbound, bobDid, "desc");
  }, [aliceInbox, aliceOutbound, bobDid]);

  const bobThread = useMemo(() => {
    if (!aliceDid) return [];
    return mergeThread(bobInbox, bobOutbound, aliceDid, "desc");
  }, [aliceDid, bobInbox, bobOutbound]);

  const aliceResponded = useRespondedProposalIds(aliceThread);
  const bobResponded = useRespondedProposalIds(bobThread);
  const aliceTxnResponded = useRespondedTransactionIds(aliceThread);
  const bobTxnResponded = useRespondedTransactionIds(bobThread);
  const bobAcceptedOffers = useMemo(() => new Set<string>(), []);
  const aliceAcceptedOffers = useMemo(() => new Set<string>(), []);

  const guidedAliceThread = useMemo(() => {
    if (!guided || !sentProposalId) return guided ? [] : aliceThread;
    return aliceThread.filter(
      (item) =>
        item.id === sentProposalId ||
        (item.kind === "scheduling-response" && item.proposalId === sentProposalId),
    );
  }, [aliceThread, guided, sentProposalId]);

  const guidedBobThread = useMemo(() => {
    if (!guided || !sentProposalId) return guided ? [] : bobThread;
    return bobThread.filter(
      (item) =>
        item.id === sentProposalId ||
        (item.kind === "scheduling-response" && item.proposalId === sentProposalId),
    );
  }, [bobThread, guided, sentProposalId]);

  const displayAliceThread = guided ? guidedAliceThread : aliceThread;
  const displayBobThread = guided ? guidedBobThread : bobThread;

  const thisProposal = useMemo(() => {
    if (!sentProposalId) return null;
    const fromOutbound = aliceOutbound.find(
      (item): item is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
        item.kind === "scheduling-proposal" && item.id === sentProposalId,
    );
    if (fromOutbound) return fromOutbound;
    return (
      bobThread.find(
        (item): item is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
          item.kind === "scheduling-proposal" && item.id === sentProposalId,
      ) ?? null
    );
  }, [aliceOutbound, bobThread, sentProposalId]);

  useEffect(() => {
    if (!guided || !thisProposal || !sentProposalId) return;
    if (bobNotifiedRef.current === sentProposalId) return;
    bobNotifiedRef.current = sentProposalId;
    bobChatRef.current?.notifyProposal({
      proposalId: sentProposalId,
      title: thisProposal.title,
      slots: thisProposal.slots,
    });
  }, [guided, sentProposalId, thisProposal]);

  async function sendProposal(title: string, slots: SchedulingSlot[]) {
    if (!bobDid) return;
    setBusy(true);
    setNote(null);
    try {
      const { objectId } = await aliceClient.sendSchedulingProposal({
        peerUrl: bobEndpoint,
        peerDid: bobDid,
        title,
        slots,
        encrypt: true,
      });
      setAliceOutbound((current) => [
        ...current,
        {
          kind: "scheduling-proposal",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: bobDid,
          title,
          slots,
        },
      ]);
      setSentProposalId(objectId);
      setCoachStep((current) => (current ? nextCoachAfterSend(current) : current));
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRespond(
    side: "alice" | "bob",
    proposalId: string,
    response: "accept" | "decline",
    slot?: SchedulingSlot,
  ) {
    const isAlice = side === "alice";
    const peerDid = isAlice ? bobDid : aliceDid;
    const peerEndpoint = isAlice ? bobEndpoint : aliceEndpoint;
    const peerLabel = isAlice ? bob.label : alice.label;
    const client = isAlice ? aliceClient : bobClient;
    const setOutbound = isAlice ? setAliceOutbound : setBobOutbound;

    if (!peerDid) return;

    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: response === "accept" ? "Confirm meeting time" : "Decline scheduling proposal",
      terms: {
        contact: peerLabel,
        proposalId,
        response,
        slot: slot?.label ?? "",
        action: response === "accept" ? "Send acceptance" : "Send decline",
      },
      confirmLabel: response === "accept" ? "Confirm & send" : "Send decline",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;

    setBusy(true);
    setNote(null);
    try {
      const thread = isAlice ? aliceThread : bobThread;
      const proposal = thread.find(
        (item): item is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
          item.kind === "scheduling-proposal" && item.id === proposalId,
      );
      await client.sendSchedulingResponse({
        peerUrl: peerEndpoint,
        peerDid,
        proposalId,
        response,
        slotId: slot?.id,
        title: response === "accept" ? proposal?.title : undefined,
        start: response === "accept" ? slot?.start : undefined,
        end: response === "accept" ? slot?.end : undefined,
        encrypt: true,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "scheduling-response",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid,
          proposalId,
          response,
          slotId: slot?.id,
          slotLabel: slot?.label,
        },
      ]);
      if (side === "bob") {
        setCoachStep((current) => (current ? nextCoachAfterAccept(current) : current));
      }
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const phase = missionPhase(coachStep);

  return (
    <div className={`atom-pair demo-pair${guided ? " demo-pair--guided" : ""}`}>
      {!guided && showIntro ? (
        <p className="atom-pair-intro demo-pair-intro">
          <strong>Alice</strong> (left) asks her agent to propose a meeting to <strong>Bob</strong>{" "}
          (right). Bob accepts. Both agents update live.
        </p>
      ) : null}

      <div className="atom-pair-columns demo-pair-columns">
        <section className="atom-pane atom-pane--alice demo-pane demo-pane--alice" aria-label="Alice">
          <header className="atom-pane-header demo-pane-header">
            <span className="atom-pane-title demo-pane-title">You · Alice</span>
            <span className="atom-pane-meta demo-pane-meta">
              Chat with your agent — she builds UI in the conversation
            </span>
          </header>
          <div className="atom-pane-body demo-pane-body demo-pane-body--chat">
            {guided ? (
              <div className="demo-pane-chat">
                <DemoAliceChatPane
                  peerName={bob.label}
                  aliceAdminUrl={alice.adminUrl}
                  aliceAdminToken={alice.adminToken}
                  busyOutbound={busy}
                  onMeetingProposed={sendProposal}
                  onUserAsked={() =>
                    setCoachStep((current) => (current ? nextCoachAfterAsk(current) : current))
                  }
                  onPickerVisible={() =>
                    setCoachStep((current) => (current ? nextCoachAfterPicker(current) : current))
                  }
                />
              </div>
            ) : (
              <div className="atom-pane-form demo-pane-form">
                <DemoProposalComposer peerName={bob.label} busy={busy} onSend={sendProposal} />
              </div>
            )}
            <div className="atom-pane-thread demo-pane-thread">
              <header className="demo-section-head demo-section-head--activity">
                <h4>Activity</h4>
                <p>Agent-to-agent messages Alice has sent and received</p>
              </header>
              <div className="atom-pane-thread-scroll demo-pane-thread-scroll">
                {displayAliceThread.length === 0 ? (
                  <p className="atom-pane-empty demo-pane-empty">
                    When Alice’s agent sends a proposal, it shows up here and in Bob’s inbox.
                  </p>
                ) : (
                  displayAliceThread.map((item) => (
                    <ThreadItemView
                      key={item.id}
                      item={item}
                      busy={busy}
                      showActions={
                        !guided &&
                        threadItemNeedsActions(
                          item,
                          aliceResponded,
                          aliceTxnResponded,
                          aliceAcceptedOffers,
                        )
                      }
                      onAcceptSlot={(proposalId, slot) =>
                        void confirmRespond("alice", proposalId, "accept", slot)
                      }
                      onDeclineProposal={(proposalId) =>
                        void confirmRespond("alice", proposalId, "decline")
                      }
                      onRsvp={() => {}}
                      onConfirmTransaction={() => {}}
                      onDeclineTransaction={() => {}}
                      onAcceptOffer={() => {}}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="demo-bob-column">
          {guided ? (
            <aside className="demo-mission demo-mission--bob" aria-label="What to do next">
              <div className="demo-mission-copy">
                <strong>What you’re watching</strong>
                <p>Bob’s agent builds a confirmation in chat. Accept or decline on that component.</p>
              </div>
              <ol className="demo-mission-steps">
                <li data-active={phase === "ask"} data-done={phase !== "ask"}>
                  <span className="demo-step-num">1</span> Ask Alice
                </li>
                <li
                  data-active={phase === "build"}
                  data-done={phase === "bob" || phase === "done"}
                >
                  <span className="demo-step-num">2</span> Alice builds UI
                </li>
                <li data-active={phase === "bob"} data-done={phase === "done"}>
                  <span className="demo-step-num">3</span> Bob confirms
                </li>
              </ol>
            </aside>
          ) : null}

          <section
            className="atom-pane atom-pane--bob demo-pane demo-pane--bob"
            aria-label="Bob"
            data-demo-target="bob-pane"
          >
            <header className="atom-pane-header demo-pane-header">
              <span className="atom-pane-title demo-pane-title">Bob · Business</span>
              <span className="atom-pane-meta demo-pane-meta">
                {guided
                  ? "Bob’s agent builds confirmation UI in the chat"
                  : "The other party’s agent inbox — receive and accept"}
              </span>
            </header>
            <div className="atom-pane-body demo-pane-body demo-pane-body--chat">
              {guided ? (
                <div className="demo-pane-chat">
                  <DemoBobChatPane
                    ref={bobChatRef}
                    bobAdminUrl={bob.adminUrl}
                    bobAdminToken={bob.adminToken}
                    busyOutbound={busy}
                    onMeetingResponse={(proposalId, response, slot) =>
                      confirmRespond("bob", proposalId, response, slot)
                    }
                  />
                </div>
              ) : null}
              <div className="atom-pane-thread demo-pane-thread">
                <header className="demo-section-head demo-section-head--activity">
                  <h4>{guided ? "Activity" : "Inbox"}</h4>
                  <p>
                    {displayBobThread.length === 0
                      ? "Waiting for Alice’s agent to send a meeting request"
                      : guided
                        ? "Agent-to-agent messages Bob has sent and received"
                        : "Open a request and accept a time"}
                  </p>
                </header>
                <div className="atom-pane-thread-scroll demo-pane-thread-scroll">
                  {displayBobThread.length === 0 ? (
                    <p className="atom-pane-empty demo-pane-empty">
                      Empty for now. After Alice proposes a time, it appears here.
                    </p>
                  ) : (
                    displayBobThread.map((item) => (
                      <ThreadItemView
                        key={item.id}
                        item={item}
                        busy={busy}
                        showActions={
                          !guided &&
                          threadItemNeedsActions(
                            item,
                            bobResponded,
                            bobTxnResponded,
                            bobAcceptedOffers,
                          )
                        }
                        onAcceptSlot={(proposalId, slot) =>
                          void confirmRespond("bob", proposalId, "accept", slot)
                        }
                        onDeclineProposal={(proposalId) =>
                          void confirmRespond("bob", proposalId, "decline")
                        }
                        onRsvp={() => {}}
                        onConfirmTransaction={() => {}}
                        onDeclineTransaction={() => {}}
                        onAcceptOffer={() => {}}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {guided ? <DemoExploreCopy /> : null}

      {note ? (
        <p className="atom-pair-note demo-pair-note" role="status">
          {note}
        </p>
      ) : null}

      {coachStep ? (
        <DemoCoach
          step={coachStep}
          onStepChange={setCoachStep}
          onDismiss={() => setCoachStep(null)}
        />
      ) : null}
    </div>
  );
}
