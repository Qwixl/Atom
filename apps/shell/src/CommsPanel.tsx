import { useCallback, useEffect, useMemo, useState } from "react";
import { verifyContactInvite } from "@qwixl/a2a-transport";
import type { OwnerRecord, OwnerStore } from "@qwixl/owner-store";
import type { ActionReserveRefKind, RsvpAnswer, SchedulingSlot } from "@qwixl/a2a-transport";
import { ThreadItemView, useRespondedProposalIds, threadItemNeedsActions } from "./comms/CoordinationCard.js";
import { CommsAgentClient } from "./comms/client.js";
import { defaultStandupSlots, mergeThread } from "./comms/coordinationThread.js";
import { DEFAULT_COMMS_AGENT_URL, loadCommsAgentConfig, saveCommsAgentConfig, saveContacts } from "./comms/storage.js";
import {
  contactToTrustedAgentPayload,
  findTrustedAgentRecord,
} from "./comms/trustedAgent.js";
import type { AgentContact, CommsThreadItem, InboxEntryWire } from "./comms/types.js";
import type { ConsequentialAction } from "@qwixl/shell-core";

export type CommsConfirmationResult =
  | { decision: "declined" }
  | { decision: "approved"; attestationRef: string };

const INBOX_POLL_MS = 4000;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function syncContactToOwnerStore(store: OwnerStore, contact: AgentContact): void {
  store.upsert({
    category: "trusted-agents",
    label: contact.name || shortDid(contact.did),
    value: JSON.stringify(contactToTrustedAgentPayload(contact)),
    guarded: true,
  });
}

function uniqueOwnerCategories(records: OwnerRecord[]): string[] {
  const categories = new Set<string>();
  for (const record of records) {
    if (record.category === "trusted-agents") continue;
    categories.add(record.category);
  }
  return [...categories].sort();
}

export function CommsPanel({
  contacts,
  ownerRecords,
  ownerStore,
  onContactsChanged,
  onProfileChanged,
  onRequestConfirmation,
  calendarAccessToken,
}: {
  contacts: AgentContact[];
  ownerRecords: OwnerRecord[];
  ownerStore: OwnerStore;
  onContactsChanged: () => void;
  onProfileChanged: () => void;
  onRequestConfirmation: (action: ConsequentialAction) => Promise<CommsConfirmationResult>;
  /** Dev: shell SecretStore token forwarded to agent-backend CalDAV proxy. */
  calendarAccessToken?: string | null;
}) {
  const [agentUrl, setAgentUrl] = useState(() => loadCommsAgentConfig().adminUrl);
  const [localDid, setLocalDid] = useState<string | null>(null);
  const [mlsPeers, setMlsPeers] = useState<string[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => contacts[0]?.id ?? null);
  const [inbox, setInbox] = useState<InboxEntryWire[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [invitePreview, setInvitePreview] = useState<{ did: string; name?: string; endpoint: string } | null>(
    null,
  );
  const [compose, setCompose] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [myInviteToken, setMyInviteToken] = useState<string | null>(null);
  const [outbound, setOutbound] = useState<CommsThreadItem[]>([]);

  const client = useMemo(() => new CommsAgentClient(agentUrl), [agentUrl]);
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const ownerCategories = useMemo(() => uniqueOwnerCategories(ownerRecords), [ownerRecords]);

  const refreshAgentStatus = useCallback(async () => {
    try {
      const health = await client.health();
      setLocalDid(health.did);
      setMlsPeers(health.mlsPeers);
      setStatusError(null);
    } catch (error) {
      setLocalDid(null);
      setMlsPeers([]);
      setStatusError(error instanceof Error ? error.message : String(error));
    }
  }, [client]);

  const refreshInbox = useCallback(async () => {
    try {
      const entries = await client.inbox();
      setInbox(entries);
    } catch {
      // inbox errors surface via status poll when agent is down
    }
  }, [client]);

  useEffect(() => {
    void refreshAgentStatus();
  }, [refreshAgentStatus]);

  useEffect(() => {
    void refreshInbox();
    const timer = window.setInterval(() => void refreshInbox(), INBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshInbox]);

  const thread = useMemo(() => {
    if (!selected) return [];
    return mergeThread(inbox, outbound, selected.did);
  }, [inbox, outbound, selected]);

  const respondedIds = useRespondedProposalIds(thread);

  const sessionReady = selected ? mlsPeers.includes(selected.did) : false;

  async function saveAgentUrl() {
    const trimmed = agentUrl.trim() || DEFAULT_COMMS_AGENT_URL;
    setAgentUrl(trimmed);
    saveCommsAgentConfig({ adminUrl: trimmed });
    setActionNote("Agent URL saved.");
    await refreshAgentStatus();
  }

  async function previewInvite() {
    setInvitePreview(null);
    setActionNote(null);
    if (!inviteInput.trim()) return;
    try {
      const verified = await verifyContactInvite(inviteInput.trim());
      setInvitePreview({
        did: verified.inviterDid,
        name: verified.name,
        endpoint: verified.endpoint,
      });
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    }
  }

  async function addContactFromInvite() {
    if (!inviteInput.trim()) return;
    setBusy(true);
    setActionNote(null);
    try {
      const verified = await verifyContactInvite(inviteInput.trim());
      const result = await client.connectInvite(inviteInput.trim());
      const contact: AgentContact = {
        id: crypto.randomUUID(),
        did: result.connected || verified.inviterDid,
        name: verified.name ?? shortDid(verified.inviterDid),
        endpoint: verified.endpoint,
        connectedAt: new Date().toISOString(),
      };
      const next = [...contacts.filter((c) => c.did !== contact.did), contact];
      saveContacts(next);
      syncContactToOwnerStore(ownerStore, contact);
      onContactsChanged();
      setSelectedId(contact.id);
      setInviteInput("");
      setInvitePreview(null);
      setActionNote(`Connected to ${contact.name}. MLS session established.`);
      await refreshAgentStatus();
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyMyInvite() {
    setBusy(true);
    setActionNote(null);
    try {
      const { token } = await client.createInvite();
      setMyInviteToken(token);
      await navigator.clipboard.writeText(token);
      setActionNote("Invitation token copied to clipboard.");
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!selected || !compose.trim()) return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.sendText({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        text: compose,
        encrypt: sessionReady,
      });
      const sentText = compose.trim();
      setOutbound((current) => [
        ...current,
        {
          kind: "message",
          id: crypto.randomUUID(),
          direction: "out",
          text: sentText,
          at: new Date().toISOString(),
          peerDid: selected.did,
        },
      ]);
      setCompose("");
      setActionNote(sessionReady ? "Encrypted message sent." : "Message sent (plain — no MLS session).");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendStandupProposal() {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      const slots = defaultStandupSlots();
      const { objectId } = await client.sendSchedulingProposal({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        title: "Team standup",
        slots,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "scheduling-proposal",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          title: "Team standup",
          slots,
        },
      ]);
      setActionNote(sessionReady ? "Scheduling proposal sent (MLS)." : "Proposal sent (plain).");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendDesignReviewRsvp() {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      const eventAt = "2026-07-10T15:00:00.000Z";
      const { objectId } = await client.sendRsvpRequest({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        eventTitle: "Design review",
        eventAt,
        location: "Room 4",
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "rsvp-request",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          eventTitle: "Design review",
          eventAt,
          location: "Room 4",
        },
      ]);
      setActionNote(sessionReady ? "RSVP request sent (MLS)." : "RSVP request sent (plain).");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function mintActionReserve(opts: {
    refId: string;
    refKind: ActionReserveRefKind;
    attestationRef: string;
    subjectId?: string;
    label?: string;
    start?: string;
    end?: string;
  }): Promise<string | null> {
    if (!selected) return null;
    try {
      const result = await client.createActionReserve({
        ...opts,
        peerDid: selected.did,
        peerUrl: selected.endpoint,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "action-reserve",
          id: result.object.id,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          refId: opts.refId,
          refKind: opts.refKind,
          label: opts.label ?? opts.refId,
          attestationRef: opts.attestationRef,
        },
      ]);
      return result.object.id;
    } catch (error) {
      console.warn("action:reserve failed", error);
      return null;
    }
  }

  async function respondScheduling(
    proposalId: string,
    response: "accept" | "decline",
    slot?: SchedulingSlot,
    proposalTitle?: string,
  ) {
    if (!selected) return;
    const calendarWrite =
      response === "accept" && slot && calendarAccessToken
        ? "Create Google Calendar event and send acceptance"
        : response === "accept"
          ? "Send acceptance to contact agent"
          : "Send decline to contact agent";
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: response === "accept" ? "Confirm meeting time" : "Decline scheduling proposal",
      terms: {
        contact: selected.name,
        proposalId,
        response,
        slot: slot?.label ?? "",
        action: calendarWrite,
      },
      confirmLabel: response === "accept" ? "Confirm & send" : "Send decline",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      if (response === "accept" && slot) {
        await mintActionReserve({
          refId: slot.id,
          refKind: "scheduling-slot",
          attestationRef: confirmation.attestationRef,
          subjectId: proposalId,
          label: slot.label,
          start: slot.start,
          end: slot.end,
        });
      }
      await client.sendSchedulingResponse({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        proposalId,
        response,
        slotId: slot?.id,
        encrypt: sessionReady,
      });
      if (response === "accept" && slot && calendarAccessToken) {
        try {
          await client.createCalendarEvent({
            title: proposalTitle?.trim() || `Meeting with ${selected.name}`,
            start: slot.start,
            end: slot.end,
            accessToken: calendarAccessToken,
          });
        } catch (calendarError) {
          setActionNote(
            `Scheduling response sent; calendar write failed: ${
              calendarError instanceof Error ? calendarError.message : String(calendarError)
            }`,
          );
          await refreshInbox();
          return;
        }
      }
      setOutbound((current) => [
        ...current,
        {
          kind: "scheduling-response",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          proposalId,
          response,
          slotId: slot?.id,
        },
      ]);
      setActionNote(
        response === "accept" && slot && calendarAccessToken
          ? "Scheduling response sent; calendar event created."
          : "Scheduling response sent.",
      );
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function respondRsvp(rsvpId: string, response: RsvpAnswer) {
    if (!selected) return;
    const rsvpItem = thread.find(
      (item): item is Extract<CommsThreadItem, { kind: "rsvp-request" }> =>
        item.kind === "rsvp-request" && item.id === rsvpId,
    );
    const calendarWrite =
      response === "yes" && calendarAccessToken && rsvpItem
        ? "Create Google Calendar event and send RSVP"
        : `Send RSVP (${response}) to contact agent`;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Update RSVP",
      terms: {
        contact: selected.name,
        rsvpId,
        response,
        action: calendarWrite,
      },
      confirmLabel: "Confirm & send",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      if (response === "yes" && rsvpItem) {
        const start = rsvpItem.eventAt;
        const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        await mintActionReserve({
          refId: rsvpId,
          refKind: "rsvp",
          attestationRef: confirmation.attestationRef,
          subjectId: rsvpId,
          label: rsvpItem.eventTitle,
          start,
          end,
        });
      }
      await client.sendRsvpResponse({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        rsvpId,
        response,
        encrypt: sessionReady,
      });
      if (response === "yes" && calendarAccessToken && rsvpItem) {
        const start = rsvpItem.eventAt;
        const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        try {
          await client.createCalendarEvent({
            title: rsvpItem.eventTitle,
            start,
            end,
            location: rsvpItem.location,
            accessToken: calendarAccessToken,
          });
        } catch (calendarError) {
          setActionNote(
            `RSVP response sent; calendar write failed: ${
              calendarError instanceof Error ? calendarError.message : String(calendarError)
            }`,
          );
          await refreshInbox();
          return;
        }
      }
      setOutbound((current) => [
        ...current,
        {
          kind: "rsvp-response",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          rsvpId,
          response,
        },
      ]);
      setActionNote(
        response === "yes" && calendarAccessToken && rsvpItem
          ? "RSVP response sent; calendar event created."
          : "RSVP response sent.",
      );
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function removeContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) {
      const record = findTrustedAgentRecord(ownerRecords, contact.did);
      if (record) ownerStore.remove(record.id);
    }
    const next = contacts.filter((c) => c.id !== id);
    saveContacts(next);
    onContactsChanged();
    onProfileChanged();
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  }

  function toggleStandingDisclosure(category: string) {
    if (!selected) return;
    const current = new Set(selected.standingDisclosure ?? []);
    if (current.has(category)) current.delete(category);
    else current.add(category);
    const standingDisclosure = [...current].sort();
    const updated: AgentContact = {
      ...selected,
      standingDisclosure: standingDisclosure.length > 0 ? standingDisclosure : undefined,
    };
    const next = contacts.map((c) => (c.id === selected.id ? updated : c));
    saveContacts(next);
    syncContactToOwnerStore(ownerStore, updated);
    onContactsChanged();
    onProfileChanged();
  }

  return (
    <aside className="shell-comms">
      <h2>Agent comms</h2>
      <p className="shell-comms-note">
        Private messages between your agent backend and contacts. MLS keys stay on the server; the shell
        only talks to your agent admin API. Contacts are mirrored to guarded <code>trusted-agents</code>{" "}
        records in your owner store.
      </p>

      <section className="shell-comms-config">
        <label className="atom-field">
          <span className="atom-field-label">My agent (admin URL)</span>
          <div className="shell-comms-config-row">
            <input
              value={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              placeholder={DEFAULT_COMMS_AGENT_URL}
            />
            <button type="button" className="chrome-approve" onClick={() => void saveAgentUrl()}>
              Save
            </button>
          </div>
        </label>
        {localDid ? (
          <p className="shell-comms-meta">
            Agent DID: <code>{shortDid(localDid)}</code>
            {mlsPeers.length > 0 ? ` · ${mlsPeers.length} MLS peer(s)` : null}
          </p>
        ) : null}
        {statusError ? <p className="shell-comms-error">{statusError}</p> : null}
        <div className="shell-comms-actions">
          <button type="button" disabled={busy} onClick={() => void copyMyInvite()}>
            Copy my invite
          </button>
          <button type="button" disabled={busy} onClick={() => void refreshInbox()}>
            Refresh inbox
          </button>
        </div>
        {myInviteToken ? (
          <textarea
            className="shell-comms-token"
            readOnly
            value={myInviteToken}
            rows={3}
            aria-label="Your invitation token"
          />
        ) : null}
      </section>

      <section className="shell-comms-add">
        <h3>Add contact</h3>
        <p className="shell-comms-hint">Paste an invitation token from another owner&apos;s agent.</p>
        <textarea
          value={inviteInput}
          onChange={(e) => {
            setInviteInput(e.target.value);
            setInvitePreview(null);
          }}
          placeholder="base64url invitation token…"
          rows={3}
        />
        <div className="shell-comms-actions">
          <button type="button" disabled={!inviteInput.trim()} onClick={() => void previewInvite()}>
            Preview
          </button>
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !inviteInput.trim()}
            onClick={() => void addContactFromInvite()}
          >
            Connect
          </button>
        </div>
        {invitePreview ? (
          <div className="shell-comms-preview">
            <strong>{invitePreview.name ?? shortDid(invitePreview.did)}</strong>
            <span>{shortDid(invitePreview.did)}</span>
            <code>{invitePreview.endpoint}</code>
          </div>
        ) : null}
      </section>

      <div className="shell-comms-layout">
        <ul className="shell-comms-contacts">
          {contacts.length === 0 ? (
            <li className="shell-comms-empty">No contacts yet.</li>
          ) : (
            contacts.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  className={contact.id === selectedId ? "active" : ""}
                  onClick={() => setSelectedId(contact.id)}
                >
                  <span className="shell-comms-contact-name">{contact.name}</span>
                  <span className="shell-comms-contact-did">{shortDid(contact.did)}</span>
                  {mlsPeers.includes(contact.did) ? (
                    <span className="shell-comms-badge">MLS</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="shell-comms-remove"
                  aria-label={`Remove ${contact.name}`}
                  onClick={() => removeContact(contact.id)}
                >
                  ×
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="shell-comms-thread">
          {selected ? (
            <>
              <div className="shell-comms-thread-head">
                <strong>{selected.name}</strong>
                <span>{sessionReady ? "Encrypted (MLS)" : "Plaintext (connect MLS first)"}</span>
              </div>
              <section className="shell-comms-disclosure">
                <h4>Disclosure policy</h4>
                <p className="shell-comms-hint">
                  Categories pre-approved for this contact&apos;s agent. Guarded records outside this
                  list still require shell chrome every time.
                </p>
                {ownerCategories.length === 0 ? (
                  <p className="shell-comms-empty">Add owner profile records to configure categories.</p>
                ) : (
                  <ul className="shell-comms-disclosure-list">
                    {ownerCategories.map((category) => {
                      const checked = selected.standingDisclosure?.includes(category) ?? false;
                      const hasGuarded = ownerRecords.some(
                        (r) => r.category === category && r.guarded,
                      );
                      return (
                        <li key={category}>
                          <label className="atom-field atom-field-checkbox">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStandingDisclosure(category)}
                            />
                            <span>
                              {category}
                              {hasGuarded ? (
                                <span className="shell-comms-disclosure-guarded"> guarded records</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section className="shell-comms-coordination-organizer">
                <h4>Coordination (M8)</h4>
                <p className="shell-comms-hint">
                  Send scheduling or RSVP data objects to this contact&apos;s agent. Requires MLS for
                  encrypted delivery.
                </p>
                <div className="shell-comms-actions">
                  <button type="button" disabled={busy} onClick={() => void sendStandupProposal()}>
                    Propose standup slots
                  </button>
                  <button type="button" disabled={busy} onClick={() => void sendDesignReviewRsvp()}>
                    Send design review RSVP
                  </button>
                </div>
              </section>
              <div className="shell-comms-messages">
                {thread.length === 0 ? (
                  <p className="shell-comms-empty">No messages yet.</p>
                ) : (
                  thread.map((item) => (
                    <ThreadItemView
                      key={item.id}
                      item={item}
                      busy={busy}
                      showActions={threadItemNeedsActions(item, respondedIds)}
                      onAcceptSlot={(proposalId, slot) => {
                        const proposal = thread.find(
                          (item): item is Extract<CommsThreadItem, { kind: "scheduling-proposal" }> =>
                            item.kind === "scheduling-proposal" && item.id === proposalId,
                        );
                        void respondScheduling(
                          proposalId,
                          "accept",
                          slot,
                          proposal?.title,
                        );
                      }}
                      onDeclineProposal={(proposalId) => void respondScheduling(proposalId, "decline")}
                      onRsvp={(rsvpId, response) => void respondRsvp(rsvpId, response)}
                    />
                  ))
                )}
              </div>
              <div className="shell-comms-compose">
                <input
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  placeholder="Message…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={busy || !compose.trim()}
                  onClick={() => void sendMessage()}
                >
                  Send
                </button>
              </div>
            </>
          ) : (
            <p className="shell-comms-empty">Select a contact to view the thread.</p>
          )}
        </div>
      </div>

      {actionNote ? <p className="shell-comms-note shell-comms-action-note">{actionNote}</p> : null}
    </aside>
  );
}
