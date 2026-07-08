import { useCallback, useEffect, useMemo, useState } from "react";
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
};

function deliveryBaseFor(agent: DemoPairAgent): string {
  return agent.deliveryBase ?? resolveAgentDeliveryBase(agent.adminUrl);
}

export function DemoPairView({
  onRequestConfirmation,
  alice = DEMO_PERSONAS.alice,
  bob = DEMO_PERSONAS.bob,
  showIntro = true,
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

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="atom-pair demo-pair">
      {showIntro ? (
        <p className="atom-pair-intro demo-pair-intro">
          <strong>Alice</strong> (left) sends a meeting proposal to <strong>Bob</strong> (right).
          Bob accepts or declines in shell confirmation chrome. Both agents update live.
        </p>
      ) : null}

      <div className="atom-pair-columns demo-pair-columns">
        <section className="atom-pane atom-pane--alice demo-pane demo-pane--alice" aria-label="Alice">
          <header className="atom-pane-header demo-pane-header">
            <span className="atom-pane-title demo-pane-title">Alice</span>
            <span className="atom-pane-meta demo-pane-meta">Personal agent → Bob</span>
          </header>
          <div className="atom-pane-body demo-pane-body">
            <div className="atom-pane-form demo-pane-form">
              <DemoProposalComposer peerName={bob.label} busy={busy} onSend={sendProposal} />
            </div>
            <div className="atom-pane-thread demo-pane-thread">
              <h4 className="atom-pane-thread-label demo-pane-thread-label">Sent &amp; received</h4>
              <div className="atom-pane-thread-scroll demo-pane-thread-scroll">
                {aliceThread.length === 0 ? (
                  <p className="atom-pane-empty demo-pane-empty">
                    Send a proposal — it appears on Bob&apos;s side.
                  </p>
                ) : (
                  aliceThread.map((item) => (
                    <ThreadItemView
                      key={item.id}
                      item={item}
                      busy={busy}
                      showActions={threadItemNeedsActions(
                        item,
                        aliceResponded,
                        aliceTxnResponded,
                        aliceAcceptedOffers,
                      )}
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

        <section className="atom-pane atom-pane--bob demo-pane demo-pane--bob" aria-label="Bob">
          <header className="atom-pane-header demo-pane-header">
            <span className="atom-pane-title demo-pane-title">Bob</span>
            <span className="atom-pane-meta demo-pane-meta">Business agent ← Alice</span>
          </header>
          <div className="atom-pane-thread atom-pane-thread--full demo-pane-thread demo-pane-thread--full">
            <h4 className="atom-pane-thread-label demo-pane-thread-label">Inbox</h4>
            <div className="atom-pane-thread-scroll demo-pane-thread-scroll">
              {bobThread.length === 0 ? (
                <p className="atom-pane-empty demo-pane-empty">Waiting for Alice&apos;s proposal…</p>
              ) : (
                bobThread.map((item) => (
                  <ThreadItemView
                    key={item.id}
                    item={item}
                    busy={busy}
                    showActions={threadItemNeedsActions(
                      item,
                      bobResponded,
                      bobTxnResponded,
                      bobAcceptedOffers,
                    )}
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
        </section>
      </div>

      {note ? (
        <p className="atom-pair-note demo-pair-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
