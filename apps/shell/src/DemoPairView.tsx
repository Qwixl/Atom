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
import { mergeThread } from "./comms/coordinationThread.js";
import type { CommsThreadItem, InboxEntryWire } from "./comms/types.js";
import type { CommsConfirmationResult } from "./CommsPanel.js";
import { DemoProposalComposer } from "./DemoProposalComposer.js";
import { DEMO_PERSONAS } from "./demoPersonas.js";

const POLL_MS = 2000;

export function DemoPairView({
  onRequestConfirmation,
}: {
  onRequestConfirmation: (action: ConsequentialAction) => Promise<CommsConfirmationResult>;
}) {
  const alice = DEMO_PERSONAS.alice;
  const bob = DEMO_PERSONAS.bob;

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

  const aliceEndpoint = `${alice.adminUrl}/a2a/jsonrpc`;
  const bobEndpoint = `${bob.adminUrl}/a2a/jsonrpc`;

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
    return mergeThread(aliceInbox, aliceOutbound, bobDid);
  }, [aliceInbox, aliceOutbound, bobDid]);

  const bobThread = useMemo(() => {
    if (!aliceDid) return [];
    return mergeThread(bobInbox, bobOutbound, aliceDid);
  }, [aliceDid, bobInbox, bobOutbound]);

  const aliceResponded = useRespondedProposalIds(aliceThread);
  const bobResponded = useRespondedProposalIds(bobThread);
  const bobTxnResponded = useRespondedTransactionIds(bobThread);
  const bobAcceptedOffers = useMemo(() => new Set<string>(), []);

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
      setNote("Proposal sent — watch it appear on Bob's side.");
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function bobRespond(
    proposalId: string,
    response: "accept" | "decline",
    slot?: SchedulingSlot,
    proposalTitle?: string,
  ) {
    if (!aliceDid) return;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: response === "accept" ? "Confirm meeting time" : "Decline scheduling proposal",
      terms: {
        contact: alice.label,
        proposalId,
        response,
        slot: slot?.label ?? "",
        action: response === "accept" ? "Send acceptance to Alice's agent" : "Send decline",
      },
      confirmLabel: response === "accept" ? "Confirm & send" : "Send decline",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setNote(null);
    try {
      await bobClient.sendSchedulingResponse({
        peerUrl: aliceEndpoint,
        peerDid: aliceDid,
        proposalId,
        response,
        slotId: slot?.id,
        encrypt: true,
      });
      setBobOutbound((current) => [
        ...current,
        {
          kind: "scheduling-response",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: aliceDid,
          proposalId,
          response,
          slotId: slot?.id,
        },
      ]);
      setNote(
        response === "accept"
          ? "Bob accepted — Alice's pane should show the reply."
          : "Bob declined — Alice's pane should show the reply.",
      );
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="demo-pair">
      <p className="demo-pair-intro">
        <strong>Alice</strong> (left) sends a meeting proposal to <strong>Bob</strong> (right).
        Bob accepts or declines in shell confirmation chrome. Both agents update live — no
        switching tabs.
      </p>

      <div className="demo-pair-columns">
        <section className="demo-pane demo-pane--alice" aria-label="Alice's agent">
          <header className="demo-pane-header">
            <span className="demo-pane-title">Alice</span>
            <span className="demo-pane-meta">her agent · encrypted to Bob</span>
          </header>
          <div className="demo-pane-split">
            <div className="demo-pane-form">
              <DemoProposalComposer peerName={bob.label} busy={busy} onSend={sendProposal} />
            </div>
            <div className="demo-pane-thread">
              <h4 className="demo-pane-thread-label">Alice&apos;s thread</h4>
              {aliceThread.length === 0 ? (
                <p className="demo-pane-empty">Nothing yet — send a proposal from the form.</p>
              ) : (
                aliceThread.map((item) => (
                  <ThreadItemView
                    key={item.id}
                    item={item}
                    busy={busy}
                    showActions={false}
                    onAcceptSlot={() => {}}
                    onDeclineProposal={() => {}}
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

        <section className="demo-pane demo-pane--bob" aria-label="Bob's agent">
          <header className="demo-pane-header">
            <span className="demo-pane-title">Bob</span>
            <span className="demo-pane-meta">his agent · encrypted from Alice</span>
          </header>
          <div className="demo-pane-thread demo-pane-thread--full">
            <h4 className="demo-pane-thread-label">Bob&apos;s inbox</h4>
            {bobThread.length === 0 ? (
              <p className="demo-pane-empty">Waiting for Alice&apos;s proposal…</p>
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
                  onAcceptSlot={(proposalId, slot) => {
                    const proposal = bobThread.find(
                      (t): t is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
                        t.kind === "scheduling-proposal" && t.id === proposalId,
                    );
                    void bobRespond(proposalId, "accept", slot, proposal?.title);
                  }}
                  onDeclineProposal={(proposalId) => void bobRespond(proposalId, "decline")}
                  onRsvp={() => {}}
                  onConfirmTransaction={() => {}}
                  onDeclineTransaction={() => {}}
                  onAcceptOffer={() => {}}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {note ? <p className="demo-pair-note">{note}</p> : null}
    </div>
  );
}
