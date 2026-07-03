import { useCallback, useEffect, useMemo, useState } from "react";
import { verifyContactInvite } from "@qwixl/a2a-transport";
import { COMMS_MESSAGE_PURPOSE } from "@qwixl/a2a-transport";
import type { OwnerStore } from "@qwixl/owner-store";
import { CommsAgentClient } from "./comms/client.js";
import { DEFAULT_COMMS_AGENT_URL, loadCommsAgentConfig, saveCommsAgentConfig, saveContacts } from "./comms/storage.js";
import type { AgentContact, CommsMessage, InboxEntryWire } from "./comms/types.js";

const INBOX_POLL_MS = 4000;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function inboxToMessages(entries: InboxEntryWire[], contactDid: string): CommsMessage[] {
  return entries
    .filter(
      (entry) =>
        entry.object.governance.purpose === COMMS_MESSAGE_PURPOSE &&
        entry.object.issuerDid === contactDid,
    )
    .map((entry) => {
      const text = typeof entry.object.payload.text === "string" ? entry.object.payload.text : "";
      const peerDid = entry.object.issuerDid;
      return {
        id: entry.object.id,
        direction: "in" as const,
        text,
        at: entry.receivedAt || entry.object.issuedAt,
        peerDid,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

function syncContactToOwnerStore(store: OwnerStore, contact: AgentContact): void {
  store.upsert({
    category: "trusted-agents",
    label: contact.name || shortDid(contact.did),
    value: JSON.stringify({ did: contact.did, endpoint: contact.endpoint }),
    guarded: true,
  });
}

export function CommsPanel({
  contacts,
  ownerStore,
  onContactsChanged,
}: {
  contacts: AgentContact[];
  ownerStore: OwnerStore;
  onContactsChanged: () => void;
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
  const [outbound, setOutbound] = useState<CommsMessage[]>([]);

  const client = useMemo(() => new CommsAgentClient(agentUrl), [agentUrl]);
  const selected = contacts.find((c) => c.id === selectedId) ?? null;

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
    const inbound = inboxToMessages(inbox, selected.did);
    const localOut = outbound.filter((msg) => msg.peerDid === selected.did);
    const merged = [...inbound, ...localOut];
    const seen = new Set<string>();
    return merged
      .filter((msg) => {
        if (seen.has(msg.id)) return false;
        seen.add(msg.id);
        return true;
      })
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [inbox, outbound, selected]);

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

  function removeContact(id: string) {
    const next = contacts.filter((c) => c.id !== id);
    saveContacts(next);
    onContactsChanged();
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
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
              <div className="shell-comms-messages">
                {thread.length === 0 ? (
                  <p className="shell-comms-empty">No messages yet.</p>
                ) : (
                  thread.map((msg) => (
                    <div key={msg.id} className={`shell-comms-msg shell-comms-msg-${msg.direction}`}>
                      <div className="shell-comms-msg-text">{msg.text}</div>
                      <time>{new Date(msg.at).toLocaleTimeString()}</time>
                    </div>
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
