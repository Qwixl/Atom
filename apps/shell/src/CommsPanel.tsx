import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { verifyContactInvite } from "@qwixl/a2a-transport";
import type { OwnerRecord, OwnerStore } from "@qwixl/owner-store";
import type { ActionReserveRefKind, MonetaryAmount, RsvpAnswer, SchedulingSlot } from "@qwixl/a2a-transport";
import type { AttestationEntry, Catalog, ModuleRegistry } from "@qwixl/shell-core";
import { ThreadItemView, useRespondedProposalIds, useRespondedTransactionIds, threadItemNeedsActions } from "./comms/CoordinationCard.js";
import { CommsAgentClient } from "./comms/client.js";
import { CommsModuleEmbed } from "./comms/CommsModuleEmbed.js";
import { mergeThread } from "./comms/coordinationThread.js";
import { deriveSharedListStates } from "./comms/sharedListLogic.js";
import { takeCommsModuleBridge } from "./comms/moduleBridge.js";
import { looksLikeSchedulingIntent } from "./comms/schedulingIntent.js";
import { applyTttMove, emptyTttBoard } from "./comms/tttLogic.js";
import {
  allShipsSunk,
  evaluateShot,
  hasCommitted,
  latestBsState,
  loadLocalShips,
  myPlayerFromThread,
  nextTurnAfterShot,
  saveLocalShips,
  shipCommitHash,
  shotAlreadyFired,
  validateShipPlacement,
} from "./comms/bsLogic.js";
import {
  exportAcceptedSchedulingToIcs,
  loadWebcalBusyEvents,
  type WebcalBusyEvent,
} from "./comms/icalExport.js";
import type { BsPlayer } from "./comms/types.js";
import { loadThreadOutbound, saveThreadOutbound } from "./comms/threadStorage.js";
import { persistCommerceReceiptsFromInbox } from "./comms/persistReceipts.js";
import { DEFAULT_COMMS_AGENT_URL, loadCommsAgentConfig, saveCommsAgentConfig, saveContacts } from "./comms/storage.js";
import { isAgentAuthError } from "./comms/agentErrors.js";
import { useAgentConfig } from "./comms/useAgentConfig.js";
import {
  contactToTrustedAgentPayload,
  findTrustedAgentRecord,
} from "./comms/trustedAgent.js";
import type { AgentContact, CommsAgentConfig, CommsThreadItem, InboxEntryWire } from "./comms/types.js";
import type { ConsequentialAction } from "@qwixl/shell-core";
import { DemoWalkthrough } from "./DemoWalkthrough.js";
import { DemoProposalComposer } from "./DemoProposalComposer.js";
import {
  deriveDemoWalkthroughStep,
  DEMO_PERSONAS,
  type DemoPersonaId,
  IS_DEMO_MODE,
} from "./demoPersonas.js";
import { DemoSessionRoleSwitcher, highlightRoleForDemoStep } from "./demo/DemoSessionRoleSwitcher.js";
import type { DemoSessionRole } from "./demo/demoSessionStorage.js";
import { ATOM_BROWSER_MODE, IS_PRODUCTION_HOST } from "./hostConfig.js";

export type CommsConfirmationResult =
  | { decision: "declined" }
  | { decision: "approved"; attestationRef: string; approvalRef: string };

const INBOX_POLL_MS = 4000;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function contactDisplayName(contact: AgentContact): string {
  return contact.handle?.trim() || contact.name;
}

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
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
  focusContactId,
  onContactsChanged,
  onProfileChanged,
  onRequestConfirmation,
  attestationEntries,
  stripePaymentMethodId,
  demoMode = IS_DEMO_MODE,
  demoPersona = "alice",
  vaultUnlocked = true,
  agentConnectionReady = true,
  onAgentAuthFailure,
  onRequestReconnect,
  agentConfigOverride,
  onPersistContacts,
  demoSession = false,
  demoSessionRole = "alice",
  onDemoSessionRoleChange,
  catalog,
  registry,
  modulesEnabled = true,
}: {
  contacts: AgentContact[];
  ownerRecords: OwnerRecord[];
  ownerStore: OwnerStore;
  focusContactId?: string | null;
  onContactsChanged: () => void;
  onProfileChanged: () => void;
  onRequestConfirmation: (action: ConsequentialAction) => Promise<CommsConfirmationResult>;
  attestationEntries: readonly AttestationEntry[];
  /** Stripe PaymentMethod id for commerce offer → hold flow (test: pm_card_visa). */
  stripePaymentMethodId?: string;
  /** When true, hide developer controls and show the guided demo walkthrough. */
  demoMode?: boolean;
  demoPersona?: DemoPersonaId;
  vaultUnlocked?: boolean;
  agentConnectionReady?: boolean;
  onAgentAuthFailure?: () => void;
  onRequestReconnect?: () => void;
  /** Ephemeral demo session — do not read/write live agent config. */
  agentConfigOverride?: CommsAgentConfig;
  onPersistContacts?: (contacts: AgentContact[]) => void;
  /** Browser demo sandbox — minimal chrome, no inline walkthrough. */
  demoSession?: boolean;
  demoSessionRole?: DemoSessionRole;
  onDemoSessionRoleChange?: (role: DemoSessionRole) => void;
  catalog?: Catalog;
  registry?: ModuleRegistry;
  modulesEnabled?: boolean;
}) {
  const contactsDialogRef = useRef<HTMLDialogElement>(null);
  const initialConfig = agentConfigOverride ?? loadCommsAgentConfig();
  const [agentUrl, setAgentUrl] = useState(() => initialConfig.adminUrl);
  const [adminToken, setAdminToken] = useState(() => initialConfig.adminToken ?? "");
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
  const [outbound, setOutbound] = useState<CommsThreadItem[]>(() => loadThreadOutbound());
  const [intentQuery, setIntentQuery] = useState("");
  const [showPurchaseIntent, setShowPurchaseIntent] = useState(false);
  const [acceptedOfferIds, setAcceptedOfferIds] = useState<Set<string>>(() => new Set());
  const persistedReceiptIds = useRef(new Set<string>());
  const processedBsShotsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSetup, setShowSetup] = useState(
    () => !demoMode && !ATOM_BROWSER_MODE && !IS_PRODUCTION_HOST && contacts.length === 0,
  );
  const [showAddContact, setShowAddContact] = useState(
    () => !demoMode && !ATOM_BROWSER_MODE && !IS_PRODUCTION_HOST && contacts.length === 0,
  );
  const [conversationPane, setConversationPane] = useState<"chat" | "contact">("chat");
  const [inlineModuleId, setInlineModuleId] = useState<string | null>(null);
  const [scheduleDismissedFor, setScheduleDismissedFor] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [webcalBusyEvents, setWebcalBusyEvents] = useState<WebcalBusyEvent[]>([]);

  useEffect(() => {
    if (focusContactId && contacts.some((c) => c.id === focusContactId)) {
      setSelectedId(focusContactId);
      return;
    }
    if (contacts[0]) setSelectedId(contacts[0].id);
  }, [contacts, demoPersona, focusContactId]);

  useEffect(() => {
    if (!demoMode || agentConfigOverride || demoSession) return;
    const persona = DEMO_PERSONAS[demoPersona];
    setAgentUrl(persona.adminUrl);
    setAdminToken(persona.adminToken);
  }, [agentConfigOverride, demoMode, demoPersona, demoSession]);

  useEffect(() => {
    if (!agentConfigOverride) return;
    setAgentUrl(agentConfigOverride.adminUrl);
    setAdminToken(agentConfigOverride.adminToken ?? "");
  }, [agentConfigOverride]);

  function persistContacts(next: AgentContact[]) {
    if (onPersistContacts) onPersistContacts(next);
    else saveContacts(next);
  }

  const { client: syncedClient } = useAgentConfig(vaultUnlocked);
  const connectionActive = agentConnectionReady && vaultUnlocked;

  const client = useMemo(() => {
    if (agentConfigOverride) {
      return new CommsAgentClient(agentConfigOverride.adminUrl, agentConfigOverride.adminToken);
    }
    if (demoMode) {
      const persona = DEMO_PERSONAS[demoPersona];
      return new CommsAgentClient(persona.adminUrl, persona.adminToken);
    }
    if (showSetup && !IS_PRODUCTION_HOST) {
      return new CommsAgentClient(agentUrl, adminToken || undefined);
    }
    return syncedClient;
  }, [adminToken, agentConfigOverride, agentUrl, demoMode, demoPersona, showSetup, syncedClient]);
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const ownerCategories = useMemo(() => uniqueOwnerCategories(ownerRecords), [ownerRecords]);
  const visibleContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const haystack = [contactDisplayName(contact), contact.name, contact.handle ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contactSearch, contacts]);

  const refreshAgentStatus = useCallback(async () => {
    if (!connectionActive) {
      setStatusError(null);
      return;
    }
    try {
      const health = await client.health();
      setLocalDid(health.did);
      setMlsPeers(health.mlsPeers);
      setStatusError(null);
    } catch (error) {
      setLocalDid(null);
      setMlsPeers([]);
      const message = error instanceof Error ? error.message : String(error);
      setStatusError(message);
      if (isAgentAuthError(error)) onAgentAuthFailure?.();
    }
  }, [client, connectionActive, onAgentAuthFailure]);

  const refreshInbox = useCallback(async () => {
    if (!connectionActive) return;
    try {
      const entries = await client.inbox();
      setInbox(entries);
      const attestationCrossRefs = attestationEntries.map((entry) => ({
        seq: entry.seq,
        hash: entry.hash,
      }));
      const added = persistCommerceReceiptsFromInbox({
        inbox: entries,
        ownerStore,
        attestationEntries: attestationCrossRefs,
        persistedReceiptIds: persistedReceiptIds.current,
      });
      if (added > 0) onProfileChanged();
    } catch {
      // inbox errors surface via status poll when agent is down
    }
  }, [attestationEntries, client, connectionActive, onProfileChanged, ownerStore]);

  useEffect(() => {
    void refreshAgentStatus();
  }, [refreshAgentStatus]);

  useEffect(() => {
    void refreshInbox();
    const pollMs = demoMode ? 2000 : INBOX_POLL_MS;
    const timer = window.setInterval(() => void refreshInbox(), pollMs);
    return () => window.clearInterval(timer);
  }, [demoMode, refreshInbox]);

  useEffect(() => {
    if (demoMode) {
      setWebcalBusyEvents([]);
      return;
    }
    let cancelled = false;
    void loadWebcalBusyEvents(client).then((events) => {
      if (!cancelled) setWebcalBusyEvents(events);
    });
    return () => {
      cancelled = true;
    };
  }, [client, demoMode, conversationPane, inlineModuleId]);

  const thread = useMemo(() => {
    if (!selected) return [];
    return mergeThread(inbox, outbound, selected.did);
  }, [inbox, outbound, selected]);

  const sharedListStates = useMemo(() => deriveSharedListStates(thread), [thread]);
  const visibleThread = useMemo(
    () => thread.filter((item) => item.kind !== "shared-list-update"),
    [thread],
  );

  const bsInlineProps = useMemo(() => {
    const state = [...thread]
      .reverse()
      .find(
        (item): item is Extract<CommsThreadItem, { kind: "bs-state" }> =>
          item.kind === "bs-state" && item.phase === "setup",
      );
    if (!state) return {};
    const myPlayer = myPlayerFromThread(state.gameId, thread);
    const needCommit = state.turn === myPlayer && !hasCommitted(state, myPlayer);
    return {
      gameId: state.gameId,
      phase: state.phase,
      myPlayer,
      readOnly: !needCommit,
    };
  }, [thread]);

  useEffect(() => {
    saveThreadOutbound(outbound);
  }, [outbound]);

  useEffect(() => {
    setConversationPane("chat");
    setInlineModuleId(null);
    setScheduleDismissedFor(null);
  }, [selectedId]);

  const lastThreadMessage = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const item = thread[i];
      if (item?.kind === "message") return item;
    }
    return null;
  }, [thread]);
  const lastThreadMessageId = lastThreadMessage?.id ?? null;
  const schedulingSuggested =
    !demoMode &&
    lastThreadMessage != null &&
    lastThreadMessageId !== scheduleDismissedFor &&
    looksLikeSchedulingIntent(lastThreadMessage.text);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, conversationPane]);

  useEffect(() => {
    if (!selected || demoMode) return;
    const bridge = takeCommsModuleBridge();
    if (!bridge) return;
    setConversationPane("chat");
    if (bridge.action === "meetingProposed") {
      void sendSchedulingProposal(bridge.title, bridge.slots);
    } else if (bridge.action === "pollCreated") {
      void sendPoll(bridge.question, bridge.options);
    } else if (bridge.action === "listCreated") {
      void sendSharedList(bridge.title, bridge.items);
    } else if (bridge.action === "splitProposed") {
      void sendSplitBill(
        bridge.label,
        bridge.totalMinor,
        bridge.currency,
        bridge.splitCount,
        bridge.shareMinor,
      );
    } else if (bridge.action === "tttStart") {
      void startTttGame(bridge.gameId);
    } else if (bridge.action === "bsStart") {
      void startBsGame(bridge.gameId);
    } else if (bridge.action === "bsCommit") {
      void commitBsShips(bridge.gameId, bridge.cells);
    }
  }, [selected, selectedId, demoMode]);

  const demoStep = deriveDemoWalkthroughStep(demoPersona, thread);
  const demoPeer = DEMO_PERSONAS[demoPersona];

  const respondedIds = useRespondedProposalIds(thread);
  const respondedTxnIds = useRespondedTransactionIds(thread);

  const sessionReady = selected ? mlsPeers.includes(selected.did) : false;
  const showDemoSplit =
    demoMode && demoPersona === "alice" && demoStep === "send" && selected != null;

  async function saveAgentUrl() {
    const trimmed = agentUrl.trim() || DEFAULT_COMMS_AGENT_URL;
    setAgentUrl(trimmed);
    saveCommsAgentConfig({ adminUrl: trimmed, adminToken: adminToken.trim() || undefined });
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
      persistContacts(next);
      syncContactToOwnerStore(ownerStore, contact);
      onContactsChanged();
      setSelectedId(contact.id);
      setInviteInput("");
      setInvitePreview(null);
      setShowSetup(false);
      setShowAddContact(false);
      setActionNote(`Connected to ${contact.name}.`);
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
    if (selected.blocked) {
      setActionNote("Unblock this contact to send messages.");
      return;
    }
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
      setActionNote("Message sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendDemoProposal(title: string, slots: SchedulingSlot[]) {
    if (!selected || demoPersona !== "alice") return;
    setBusy(true);
    setActionNote(null);
    try {
      const { objectId } = await client.sendSchedulingProposal({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        title,
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
          title,
          slots,
        },
      ]);
      setActionNote("Proposal sent to Bob's agent (MLS). Switch to Bob to respond.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendSchedulingProposal(title: string, slots: SchedulingSlot[]) {
    if (!selected || slots.length === 0) return;
    setBusy(true);
    setActionNote(null);
    try {
      const { objectId } = await client.sendSchedulingProposal({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        title,
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
          title,
          slots,
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("Meeting proposal sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendPoll(question: string, options: Array<{ id: string; label: string }>) {
    if (!selected || options.length < 2) return;
    setBusy(true);
    setActionNote(null);
    try {
      const { objectId } = await client.sendPoll({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        question,
        options,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "poll-request",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          question,
          options,
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("Poll sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function respondPollVote(pollId: string, optionId: string) {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.sendPollVote({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        pollId,
        optionId,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "poll-vote",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          pollId,
          optionId,
        },
      ]);
      setActionNote("Vote sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendSplitBill(
    label: string,
    totalMinor: number,
    currency: string,
    splitCount: number,
    shareMinor: number,
  ) {
    if (!selected || totalMinor <= 0 || shareMinor <= 0 || splitCount < 2) return;
    setBusy(true);
    setActionNote(null);
    const splitId = crypto.randomUUID();
    try {
      const { objectId } = await client.sendSplitBill({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        splitId,
        label,
        totalMinor,
        currency,
        splitCount,
        shareMinor,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "split-proposal",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          splitId,
          label,
          totalMinor,
          currency,
          splitCount,
          shareMinor,
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("Split bill sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function paySplitShare(splitId: string, label: string, amount: MonetaryAmount) {
    if (!selected) return;
    const paymentMethodId = stripePaymentMethodId?.trim() || "pm_card_visa";
    const transactionId = `txn-split-${splitId}`;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Pay your share",
      terms: {
        contact: selected.name,
        splitId,
        label,
        amount: `${(amount.amountMinor / 100).toFixed(2)} ${amount.currency}`,
        action: "Place authorization hold for your split (M11)",
      },
      confirmLabel: "Pay share",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.offerTransaction({
        transactionId,
        attestationRef: confirmation.attestationRef,
        paymentMethodId,
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        label,
        subjectId: splitId,
        encrypt: sessionReady,
      });
      setActionNote("Share paid — payment hold placed.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendSharedList(title: string, items: Array<{ id: string; text: string; done: boolean }>) {
    if (!selected || items.length === 0) return;
    setBusy(true);
    setActionNote(null);
    const listId = crypto.randomUUID();
    try {
      const { objectId } = await client.sendSharedList({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        listId,
        title,
        items,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "shared-list",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          listId,
          title,
          items,
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("List sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendSharedListUpdate(listId: string, items: Array<{ id: string; text: string; done: boolean }>) {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.sendSharedListUpdate({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        listId,
        items,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "shared-list-update",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          listId,
          items,
        },
      ]);
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function startTttGame(gameId: string) {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      const board = emptyTttBoard();
      const { objectId } = await client.sendTttState({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        board,
        turn: "X",
        status: "active",
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "ttt-state",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          board,
          turn: "X",
          status: "active",
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("Game started.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function playTttCell(gameId: string, cell: number, mark: "X" | "O") {
    if (!selected) return;
    const stateItem = [...thread]
      .reverse()
      .find(
        (item): item is Extract<CommsThreadItem, { kind: "ttt-state" }> =>
          item.kind === "ttt-state" && item.gameId === gameId,
      );
    if (!stateItem || stateItem.status !== "active") return;
    setBusy(true);
    setActionNote(null);
    try {
      const next = applyTttMove(stateItem.board, cell, mark);
      await client.sendTttMove({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        cell,
        mark,
        encrypt: sessionReady,
      });
      const { objectId } = await client.sendTttState({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        board: next.board,
        turn: next.turn,
        status: next.status,
        winner: next.winner,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "ttt-move",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          cell,
          mark,
        },
        {
          kind: "ttt-state",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          board: next.board,
          turn: next.turn,
          status: next.status,
          winner: next.winner,
        },
      ]);
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function startBsGame(gameId: string) {
    if (!selected) return;
    setBusy(true);
    setActionNote(null);
    try {
      const { objectId } = await client.sendBsState({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        phase: "setup",
        turn: "A",
        shots: [],
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "bs-state",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          phase: "setup",
          turn: "A",
          shots: [],
        },
      ]);
      setInlineModuleId(null);
      setConversationPane("chat");
      setActionNote("Battleships game started — place your ships.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function commitBsShips(gameId: string, cells: number[]) {
    if (!selected) return;
    if (!validateShipPlacement(cells)) {
      setActionNote("Place three ships (two cells each, adjacent horizontally or vertically).");
      return;
    }
    const myPlayer = myPlayerFromThread(gameId, thread);
    saveLocalShips(gameId, myPlayer, cells);
    const stateItem = latestBsState(gameId, thread);
    if (!stateItem || stateItem.phase !== "setup") {
      setActionNote("No battleships setup in progress.");
      return;
    }
    if (stateItem.turn !== myPlayer) {
      setActionNote("Wait for your opponent before committing.");
      return;
    }
    if (hasCommitted(stateItem, myPlayer)) {
      setActionNote("You already committed your ships.");
      return;
    }
    setBusy(true);
    setActionNote(null);
    try {
      const hash = await shipCommitHash(gameId, myPlayer, cells);
      const commitA = myPlayer === "A" ? hash : stateItem.commitA;
      const commitB = myPlayer === "B" ? hash : stateItem.commitB;
      const bothReady = !!commitA && !!commitB;
      const phase = bothReady ? "battle" : "setup";
      const turn: BsPlayer = bothReady ? "A" : myPlayer === "A" ? "B" : "A";
      const { objectId } = await client.sendBsState({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        phase,
        turn,
        commitA,
        commitB,
        shots: stateItem.shots,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "bs-state",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          phase,
          turn,
          commitA,
          commitB,
          shots: stateItem.shots,
        },
      ]);
      setInlineModuleId(null);
      setActionNote(bothReady ? "Battle begins!" : "Ships committed — waiting for opponent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function fireBsShot(gameId: string, cell: number) {
    if (!selected) return;
    const stateItem = latestBsState(gameId, thread);
    if (!stateItem || stateItem.phase !== "battle") return;
    const myPlayer = myPlayerFromThread(gameId, thread);
    if (stateItem.turn !== myPlayer) return;
    if (shotAlreadyFired(stateItem.shots, cell, myPlayer)) return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.sendBsShot({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId,
        cell,
        shooter: myPlayer,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "bs-shot",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId,
          cell,
          shooter: myPlayer,
        },
      ]);
      setActionNote("Shot fired.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function respondToBsShot(
    shot: Extract<CommsThreadItem, { kind: "bs-shot" }>,
    stateItem: Extract<CommsThreadItem, { kind: "bs-state" }>,
    myPlayer: BsPlayer,
    ships: number[],
  ) {
    if (!selected) return;
    const hit = evaluateShot(ships, shot.cell);
    const shots = [...stateItem.shots, { cell: shot.cell, shooter: shot.shooter, hit }];
    const iWin = allShipsSunk(ships, shots, myPlayer);
    const phase = iWin ? "won" : "battle";
    const winner = iWin ? shot.shooter : undefined;
    const turn = iWin ? shot.shooter : nextTurnAfterShot(shot.shooter, hit);
    setBusy(true);
    try {
      const { objectId } = await client.sendBsState({
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        gameId: shot.gameId,
        phase,
        turn,
        commitA: stateItem.commitA,
        commitB: stateItem.commitB,
        shots,
        winner,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "bs-state",
          id: objectId,
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          gameId: shot.gameId,
          phase,
          turn,
          commitA: stateItem.commitA,
          commitB: stateItem.commitB,
          shots,
          winner,
        },
      ]);
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selected || demoMode || busy) return;
    for (const item of thread) {
      if (item.kind !== "bs-shot" || item.direction !== "in") continue;
      if (processedBsShotsRef.current.has(item.id)) continue;
      const stateItem = latestBsState(item.gameId, thread);
      if (!stateItem || stateItem.phase === "won") continue;
      const answered = stateItem.shots.some(
        (shot) => shot.cell === item.cell && shot.shooter === item.shooter,
      );
      if (answered) {
        processedBsShotsRef.current.add(item.id);
        continue;
      }
      const myPlayer = myPlayerFromThread(item.gameId, thread);
      const opponent = myPlayer === "A" ? "B" : "A";
      if (item.shooter !== opponent) continue;
      const ships = loadLocalShips(item.gameId, myPlayer);
      if (!ships) continue;
      processedBsShotsRef.current.add(item.id);
      void respondToBsShot(item, stateItem, myPlayer, ships);
    }
  }, [thread, selected, demoMode, busy]);

  function downloadSchedulingIcs(item: Extract<CommsThreadItem, { kind: "scheduling-response" }>) {
    if (!exportAcceptedSchedulingToIcs(thread, item)) {
      setActionNote("Could not export a calendar file for this meeting.");
    }
  }

  function handleModuleEvent(name: string, payload: Record<string, unknown>) {
    if (name === "meetingProposed") {
      const title = typeof payload.title === "string" ? payload.title : "Meeting";
      const slots = Array.isArray(payload.slots) ? (payload.slots as SchedulingSlot[]) : [];
      void sendSchedulingProposal(title, slots);
      return;
    }
    if (name === "pollCreated") {
      const question = typeof payload.question === "string" ? payload.question : "";
      const options = Array.isArray(payload.options)
        ? payload.options.filter(
            (o): o is { id: string; label: string } =>
              !!o && typeof o === "object" && typeof (o as { id?: string }).id === "string",
          )
        : [];
      void sendPoll(question, options);
      return;
    }
    if (name === "splitProposed") {
      const label = typeof payload.label === "string" ? payload.label : "Split bill";
      const totalMinor = typeof payload.totalMinor === "number" ? payload.totalMinor : 0;
      const currency = typeof payload.currency === "string" ? payload.currency : "USD";
      const splitCount = typeof payload.splitCount === "number" ? payload.splitCount : 2;
      const shareMinor = typeof payload.shareMinor === "number" ? payload.shareMinor : 0;
      if (totalMinor > 0 && shareMinor > 0) {
        void sendSplitBill(label, totalMinor, currency, splitCount, shareMinor);
      }
      return;
    }
    if (name === "tttStart") {
      const gameId = typeof payload.gameId === "string" ? payload.gameId : `ttt-${Date.now()}`;
      void startTttGame(gameId);
      return;
    }
    if (name === "tttMove") {
      const gameId = typeof payload.gameId === "string" ? payload.gameId : "";
      const cell = typeof payload.cell === "number" ? payload.cell : -1;
      const mark = payload.mark === "O" ? "O" : "X";
      if (gameId && cell >= 0) void playTttCell(gameId, cell, mark);
      return;
    }
    if (name === "bsStart") {
      const gameId = typeof payload.gameId === "string" ? payload.gameId : `bs-${Date.now()}`;
      void startBsGame(gameId);
      return;
    }
    if (name === "bsCommit") {
      const gameId = typeof payload.gameId === "string" ? payload.gameId : "";
      const cells = Array.isArray(payload.cells)
        ? payload.cells.filter((cell): cell is number => typeof cell === "number")
        : [];
      if (gameId && cells.length > 0) void commitBsShips(gameId, cells);
      return;
    }
    if (name === "listCreated") {
      const title = typeof payload.title === "string" ? payload.title : "Shared list";
      const items = Array.isArray(payload.items)
        ? payload.items.filter(
            (entry): entry is { id: string; text: string; done: boolean } =>
              !!entry &&
              typeof entry === "object" &&
              typeof (entry as { id?: string }).id === "string" &&
              typeof (entry as { text?: string }).text === "string",
          )
        : [];
      if (items.length > 0) void sendSharedList(title, items);
    }
  }

  const modulesReady = modulesEnabled && catalog && registry;

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
  ) {
    if (!selected) return;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: response === "accept" ? "Confirm meeting time" : "Decline scheduling proposal",
      terms: {
        contact: selected.name,
        proposalId,
        response,
        slot: slot?.label ?? "",
        action: response === "accept" ? "Send acceptance to contact agent" : "Send decline to contact agent",
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
          slotLabel: slot?.label,
        },
      ]);
      setActionNote("Scheduling response sent.");
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
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Update RSVP",
      terms: {
        contact: selected.name,
        rsvpId,
        response,
        action: `Send RSVP (${response}) to contact agent`,
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
      setActionNote("RSVP response sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function respondTransactionConfirm(transactionId: string, label?: string) {
    if (!selected) return;
    const holdItem = thread.find(
      (item): item is Extract<CommsThreadItem, { kind: "transaction-hold" }> =>
        item.kind === "transaction-hold" && item.transactionId === transactionId,
    );
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Confirm transaction",
      terms: {
        contact: selected.name,
        transactionId,
        label: label ?? transactionId,
        amount: holdItem
          ? `${(holdItem.amount.amountMinor / 100).toFixed(2)} ${holdItem.amount.currency}`
          : "",
        action: "Confirm payee side and authorize payer capture",
      },
      confirmLabel: "Confirm in shell chrome",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.confirmTransaction({
        transactionId,
        attestationRef: confirmation.attestationRef,
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "transaction-confirm",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          transactionId,
          role: "payee",
          amount: holdItem?.amount ?? { currency: "EUR", amountMinor: 0 },
          label,
        },
      ]);
      setActionNote("Transaction confirmed — awaiting payer capture.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function respondTransactionDecline(transactionId: string, label?: string) {
    if (!selected) return;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Decline transaction",
      terms: {
        contact: selected.name,
        transactionId,
        label: label ?? transactionId,
        action: "Release payment hold and notify payer",
      },
      confirmLabel: "Decline & release",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.declineTransaction({
        transactionId,
        attestationRef: confirmation.attestationRef,
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "transaction-status",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          transactionId,
          status: "release",
          reason: "declined",
        },
      ]);
      setActionNote("Transaction declined; hold release requested.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendPurchaseIntent() {
    if (!selected || !intentQuery.trim()) return;
    const intentId = `intent-${crypto.randomUUID()}`;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Send purchase intent",
      terms: {
        contact: selected.name,
        intentId,
        query: intentQuery.trim(),
        action: "Broadcast signed commerce intent to counterpart agent",
      },
      confirmLabel: "Send intent",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.sendCommerceIntent({
        intentId,
        query: intentQuery.trim(),
        replyUrl: agentUrl,
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        encrypt: sessionReady,
      });
      setOutbound((current) => [
        ...current,
        {
          kind: "commerce-intent",
          id: crypto.randomUUID(),
          direction: "out",
          at: new Date().toISOString(),
          peerDid: selected.did,
          intentId,
          query: intentQuery.trim(),
        },
      ]);
      setIntentQuery("");
      setActionNote("Purchase intent sent.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function acceptCommerceOffer(
    offerId: string,
    intentId: string,
    label: string,
    amount: MonetaryAmount,
  ) {
    if (!selected) return;
    const paymentMethodId = stripePaymentMethodId?.trim() || "pm_card_visa";
    const transactionId = `txn-${offerId}`;
    const action: ConsequentialAction = {
      id: crypto.randomUUID(),
      kind: "confirmation",
      title: "Accept signed offer",
      terms: {
        contact: selected.name,
        offerId,
        label,
        amount: `${(amount.amountMinor / 100).toFixed(2)} ${amount.currency}`,
        action: "Place authorization hold from signed offer fields (M11)",
      },
      confirmLabel: "Accept & hold",
      declineLabel: "Cancel",
    };
    const confirmation = await onRequestConfirmation(action);
    if (confirmation.decision !== "approved") return;
    setBusy(true);
    setActionNote(null);
    try {
      await client.offerTransaction({
        transactionId,
        attestationRef: confirmation.attestationRef,
        paymentMethodId,
        peerUrl: selected.endpoint,
        peerDid: selected.did,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        label,
        subjectId: offerId,
        encrypt: sessionReady,
      });
      setAcceptedOfferIds((current) => new Set([...current, offerId]));
      setActionNote("Offer accepted — payment hold placed.");
      await refreshInbox();
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function updateContactPolicy(patch: Partial<Pick<AgentContact, "blocked" | "muted">>) {
    if (!selected) return;
    const updated: AgentContact = { ...selected, ...patch };
    const next = contacts.map((contact) => (contact.id === selected.id ? updated : contact));
    persistContacts(next);
    syncContactToOwnerStore(ownerStore, updated);
    onContactsChanged();
    onProfileChanged();
  }

  function removeContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    if (contact) {
      const record = findTrustedAgentRecord(ownerRecords, contact.did);
      if (record) ownerStore.remove(record.id);
    }
    const next = contacts.filter((c) => c.id !== id);
    persistContacts(next);
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
    persistContacts(next);
    syncContactToOwnerStore(ownerStore, updated);
    onContactsChanged();
    onProfileChanged();
  }

  return (
    <aside
      className={`panel-view comms-view comms-workspace${demoMode ? " comms-view--demo" : ""}${demoSession ? " comms-view--session" : ""}`}
    >
      {!demoSession ? (
      <header className="panel-toolbar">
        <p className="panel-toolbar-meta">
          {demoMode ? (
            <>
              Demo · <strong>{demoPeer.label}</strong>
            </>
          ) : statusError ? (
            <>
              {statusError}
              {IS_PRODUCTION_HOST && onRequestReconnect ? (
                <button
                  type="button"
                  className="panel-btn panel-btn--inline"
                  onClick={onRequestReconnect}
                >
                  Reconnect agent
                </button>
              ) : null}
            </>
          ) : !connectionActive ? (
            "Unlock your vault to connect…"
          ) : localDid ? (
            "Connected"
          ) : (
            "Connecting to your agent…"
          )}
        </p>
        {!demoMode && !ATOM_BROWSER_MODE && !IS_PRODUCTION_HOST ? (
          <div className="panel-toolbar-actions">
            <button type="button" className="panel-btn" disabled={busy} onClick={() => void refreshInbox()}>
              Refresh inbox
            </button>
            <button
              type="button"
              className={`panel-btn${showSetup ? " is-active" : ""}`}
              onClick={() => setShowSetup((open) => !open)}
            >
              {showSetup ? "Hide setup" : "Setup"}
            </button>
          </div>
        ) : !demoMode ? (
          <div className="panel-toolbar-actions">
            <button type="button" className="panel-btn" disabled={busy} onClick={() => void refreshInbox()}>
              Refresh inbox
            </button>
          </div>
        ) : null}
      </header>
      ) : null}

      {demoMode && !demoSession ? <DemoWalkthrough step={demoStep} /> : null}

      {!demoMode && !ATOM_BROWSER_MODE && !IS_PRODUCTION_HOST && showSetup ? (
        <div className="comms-setup">
          <section className="comms-setup-card">
            <h3>Agent connection</h3>
            <p className="comms-hint">
              Connect to your personal agent to send and receive encrypted messages.
            </p>
            <label className="panel-form-field">
              <span className="panel-form-label">Agent URL</span>
              <div className="comms-inline-row">
                <input
                  className="panel-input"
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  placeholder={DEFAULT_COMMS_AGENT_URL}
                />
                <button type="button" className="panel-btn panel-btn-primary" onClick={() => void saveAgentUrl()}>
                  Save
                </button>
              </div>
            </label>
            <label className="panel-form-field">
              <span className="panel-form-label">Connection token</span>
              <input
                className="panel-input"
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Paste your connection token"
                autoComplete="off"
              />
            </label>
            <div className="comms-inline-actions">
              <button type="button" className="panel-btn" disabled={busy} onClick={() => void copyMyInvite()}>
                Copy my invite
              </button>
            </div>
            {myInviteToken ? (
              <textarea
                className="panel-textarea comms-token-field"
                readOnly
                value={myInviteToken}
                rows={3}
                aria-label="Your invitation token"
              />
            ) : null}
          </section>

          <section className="comms-setup-card">
            <div className="comms-setup-card-head">
              <h3>Add contact</h3>
              {contacts.length > 0 ? (
                <button type="button" className="panel-btn-ghost" onClick={() => setShowAddContact((open) => !open)}>
                  {showAddContact ? "Cancel" : "New contact"}
                </button>
              ) : null}
            </div>
            {contacts.length === 0 || showAddContact ? (
              <>
                <p className="comms-hint">Paste an invitation token from another owner&apos;s agent.</p>
                <textarea
                  className="panel-textarea"
                  value={inviteInput}
                  onChange={(e) => {
                    setInviteInput(e.target.value);
                    setInvitePreview(null);
                  }}
                  placeholder="base64url invitation token…"
                  rows={3}
                />
                <div className="comms-inline-actions">
                  <button type="button" className="panel-btn" disabled={!inviteInput.trim()} onClick={() => void previewInvite()}>
                    Preview
                  </button>
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={busy || !inviteInput.trim()}
                    onClick={() => void addContactFromInvite()}
                  >
                    Connect
                  </button>
                </div>
                {invitePreview ? (
                  <div className="comms-preview">
                    <strong>{invitePreview.name ?? shortDid(invitePreview.did)}</strong>
                    <span>{shortDid(invitePreview.did)}</span>
                    <code>{invitePreview.endpoint}</code>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="comms-hint">Use an invitation token to connect to another agent.</p>
            )}
          </section>
        </div>
      ) : null}

      <dialog ref={contactsDialogRef} className="comms-contacts-dialog" aria-label="Contacts">
        <div className="comms-contacts-dialog-inner">
          <header className="comms-contacts-dialog-head">
            <strong>Contacts</strong>
            <form method="dialog">
              <button type="submit" className="btn btn-ghost">
                Close
              </button>
            </form>
          </header>
          <ul className="panel-list-scroll comms-contact-list">
            {visibleContacts.map((contact) => {
              const encrypted = mlsPeers.includes(contact.did);
              const isSelected = contact.id === selectedId;
              return (
                <li key={`dialog-${contact.id}`}>
                  <button
                    type="button"
                    className={`panel-row comms-contact${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      setSelectedId(contact.id);
                      contactsDialogRef.current?.close();
                    }}
                  >
                    <span className="panel-avatar comms-contact-avatar" aria-hidden="true">
                      {contactInitials(contactDisplayName(contact))}
                    </span>
                    <span className="panel-row-body comms-contact-body">
                      <span className="panel-row-title comms-contact-name">{contactDisplayName(contact)}</span>
                      <span className="panel-row-meta comms-contact-meta">
                        {encrypted ? "Encrypted" : "Connecting…"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>

      <div className={`panel-body panel-master-detail comms-main${demoMode ? " comms-main--demo" : ""}`}>
        {!demoSession ? (
        <nav className="panel-list comms-sidebar" aria-label="Contacts">
          <div className="panel-list-head">
            <span>Contacts</span>
            {!showSetup && contacts.length > 0 ? (
              <button
                type="button"
                className="panel-btn-ghost"
                onClick={() => {
                  if (ATOM_BROWSER_MODE) {
                    setShowAddContact(true);
                    return;
                  }
                  setShowSetup(true);
                  setShowAddContact(true);
                }}
              >
                + Add
              </button>
            ) : null}
          </div>
          {contacts.length > 0 ? (
            <label className="comms-contact-search">
              <span className="visually-hidden">Search contacts</span>
              <input
                className="panel-input"
                type="search"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search contacts…"
              />
            </label>
          ) : null}
          {ATOM_BROWSER_MODE && showAddContact ? (
            <div className="comms-setup-card comms-browser-add">
              <div className="comms-setup-card-head">
                <h3>Add contact</h3>
                <button type="button" className="panel-btn-ghost" onClick={() => setShowAddContact(false)}>
                  Cancel
                </button>
              </div>
              <p className="comms-hint">Paste an invitation token from another owner&apos;s agent.</p>
              <textarea
                className="panel-textarea"
                value={inviteInput}
                onChange={(e) => {
                  setInviteInput(e.target.value);
                  setInvitePreview(null);
                }}
                placeholder="base64url invitation token…"
                rows={3}
              />
              <div className="comms-inline-actions">
                <button type="button" className="panel-btn" disabled={!inviteInput.trim()} onClick={() => void previewInvite()}>
                  Preview
                </button>
                <button
                  type="button"
                  className="panel-btn panel-btn-primary"
                  disabled={busy || !inviteInput.trim()}
                  onClick={() => void addContactFromInvite()}
                >
                  Add contact
                </button>
              </div>
              {invitePreview ? (
                <p className="comms-hint">
                  {invitePreview.name ?? shortDid(invitePreview.did)} · {invitePreview.endpoint.replace(/^https?:\/\//, "")}
                </p>
              ) : null}
            </div>
          ) : null}
          <ul className="panel-list-scroll comms-contact-list">
            {contacts.length === 0 ? (
              <li className="panel-empty">
                {ATOM_BROWSER_MODE ? "No contacts yet. Use Discover to message someone." : "No contacts yet. Open Setup to connect."}
              </li>
            ) : visibleContacts.length === 0 ? (
              <li className="panel-empty">No contacts match your search.</li>
            ) : (
              visibleContacts.map((contact) => {
                const encrypted = mlsPeers.includes(contact.did);
                const isSelected = contact.id === selectedId;
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      className={`panel-row comms-contact${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(contact.id)}
                    >
                      <span className="panel-avatar comms-contact-avatar" aria-hidden="true">
                        {contactInitials(contactDisplayName(contact))}
                      </span>
                      <span className="panel-row-body comms-contact-body">
                        <span className="panel-row-title comms-contact-name">{contactDisplayName(contact)}</span>
                        <span className="panel-row-meta comms-contact-meta">
                          {contact.blocked ? "Blocked" : contact.muted ? "Muted · " : ""}
                          {encrypted ? "Encrypted" : "Connecting…"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </nav>
        ) : null}

        <section className="panel-detail comms-conversation">
          {selected ? (
            <>
              <header className="panel-detail-head comms-peer-bar">
                {demoSession && onDemoSessionRoleChange ? (
                  <DemoSessionRoleSwitcher
                    active={demoSessionRole}
                    highlight={highlightRoleForDemoStep(demoStep)}
                    onSwitch={onDemoSessionRoleChange}
                  />
                ) : null}
                <div className="panel-detail-identity comms-peer-identity">
                  <span className="panel-avatar panel-avatar-lg comms-contact-avatar" aria-hidden="true">
                    {contactInitials(selected.name)}
                  </span>
                  <div>
                    <strong className="panel-detail-title comms-peer-name">{contactDisplayName(selected)}</strong>
                    {selected.handle && selected.name.trim() && selected.handle !== selected.name ? (
                      <span className="comms-peer-subname">{selected.name}</span>
                    ) : null}
                    <span className={`panel-detail-subtitle comms-peer-status${sessionReady ? " is-secure" : " is-warn"}`}>
                      {selected.blocked
                        ? "Blocked"
                        : sessionReady
                          ? "Encrypted"
                          : "Connecting…"}
                    </span>
                  </div>
                </div>
                <div className="panel-detail-actions comms-peer-actions">
                  {!demoSession ? (
                  <button
                    type="button"
                    className="btn btn-ghost comms-open-contacts"
                    onClick={() => contactsDialogRef.current?.showModal()}
                  >
                    Contacts
                  </button>
                  ) : null}
                </div>
              </header>

              {!demoMode ? (
                <div className="comms-pane-tabs" role="tablist" aria-label="Conversation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={conversationPane === "chat"}
                    className={`comms-pane-tab${conversationPane === "chat" ? " is-active" : ""}`}
                    onClick={() => setConversationPane("chat")}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={conversationPane === "contact"}
                    className={`comms-pane-tab${conversationPane === "contact" ? " is-active" : ""}`}
                    onClick={() => setConversationPane("contact")}
                  >
                    Contact
                  </button>
                </div>
              ) : null}

              {conversationPane === "contact" && !demoMode ? (
                <div className="comms-contact-pane">
                  <div className="comms-contact-actions">
                    <button
                      type="button"
                      className="panel-btn"
                      onClick={() => updateContactPolicy({ muted: !selected.muted })}
                    >
                      {selected.muted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      type="button"
                      className="panel-btn"
                      onClick={() => updateContactPolicy({ blocked: !selected.blocked })}
                    >
                      {selected.blocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      type="button"
                      className="panel-btn panel-btn-danger comms-peer-remove"
                      aria-label={`Remove ${selected.name}`}
                      onClick={() => removeContact(selected.id)}
                    >
                      Remove
                    </button>
                    {modulesReady ? (
                      <>
                        <button
                          type="button"
                          className="panel-btn"
                          disabled={busy || selected.blocked || !sessionReady}
                          onClick={() => {
                            setConversationPane("chat");
                            setInlineModuleId("coordination/poll");
                          }}
                        >
                          Start poll
                        </button>
                        <button
                          type="button"
                          className="panel-btn"
                          disabled={busy || selected.blocked || !sessionReady}
                          onClick={() => {
                            setConversationPane("chat");
                            setInlineModuleId("coordination/shared-list");
                          }}
                        >
                          Shared list
                        </button>
                        <button
                          type="button"
                          className="panel-btn"
                          disabled={busy || selected.blocked || !sessionReady}
                          onClick={() => {
                            setConversationPane("chat");
                            setInlineModuleId("commerce/split-bill");
                          }}
                        >
                          Split bill
                        </button>
                        <button
                          type="button"
                          className="panel-btn"
                          disabled={busy || selected.blocked || !sessionReady}
                          onClick={() => {
                            setConversationPane("chat");
                            setInlineModuleId("games/tictactoe");
                          }}
                        >
                          Play tic-tac-toe
                        </button>
                        <button
                          type="button"
                          className="panel-btn"
                          disabled={busy || selected.blocked || !sessionReady}
                          onClick={() => {
                            setConversationPane("chat");
                            setInlineModuleId("games/battleships");
                          }}
                        >
                          Play battleships
                        </button>
                      </>
                    ) : null}
                  </div>
                  {ownerCategories.length > 0 ? (
                    <section className="comms-contact-section">
                      <h3 className="comms-contact-section-title">Disclosure</h3>
                      <ul className="comms-disclosure-list">
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
                                    <span className="comms-disclosure-guarded"> guarded</span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {(demoMode || conversationPane === "chat") ? (
              <>
              {showDemoSplit ? (
                <div className="comms-thread-area comms-thread-area--split">
                  <DemoProposalComposer
                    peerName={selected.name}
                    busy={busy}
                    onSend={(title, slots) => void sendDemoProposal(title, slots)}
                  />
                  <div className="comms-messages comms-messages--pane">
                    {thread.length === 0 ? (
                      <div className="comms-empty-thread comms-empty-thread--pane">
                        <strong>Thread with {selected.name}</strong>
                        <p>Proposals and responses appear here after you send.</p>
                      </div>
                    ) : (
                      visibleThread.map((item) => (
                        <ThreadItemView
                          key={item.id}
                          item={item}
                          busy={busy}
                          showActions={threadItemNeedsActions(
                            item,
                            respondedIds,
                            respondedTxnIds,
                            acceptedOfferIds,
                          )}
                          onAcceptSlot={(proposalId, slot) => {
                            void respondScheduling(proposalId, "accept", slot);
                          }}
                          onDeclineProposal={(proposalId) => void respondScheduling(proposalId, "decline")}
                          onRsvp={(rsvpId, response) => void respondRsvp(rsvpId, response)}
                          onConfirmTransaction={(transactionId, label) =>
                            void respondTransactionConfirm(transactionId, label)
                          }
                          onDeclineTransaction={(transactionId, label) =>
                            void respondTransactionDecline(transactionId, label)
                          }
                          onAcceptOffer={(offerId, intentId, label, amount) =>
                            void acceptCommerceOffer(offerId, intentId, label, amount)
                          }
                          onPollVote={(pollId, optionId) => void respondPollVote(pollId, optionId)}
                          onPaySplitShare={(splitId, label, amount) =>
                            void paySplitShare(splitId, label, amount)
                          }
                          onTttCell={(gameId, cell, mark) => void playTttCell(gameId, cell, mark)}
                          onBsFire={(gameId, cell) => void fireBsShot(gameId, cell)}
                          onDownloadIcs={(item) => downloadSchedulingIcs(item)}
                          sharedListItems={
                            item.kind === "shared-list"
                              ? sharedListStates.get(item.listId)?.items
                              : undefined
                          }
                          onSharedListChange={(listId, items) => void sendSharedListUpdate(listId, items)}
                        />
                      ))
                    )}
                    <div ref={messagesEndRef} aria-hidden="true" />
                  </div>
                </div>
              ) : (
              <div className="comms-thread-area">
              <div className="comms-messages">
                {thread.length === 0 ? (
                  <div className="comms-empty-thread">
                    {demoMode ? (
                      <>
                        <strong>
                          {demoPersona === "alice"
                            ? "No messages yet"
                            : "Waiting for Alice's proposal"}
                        </strong>
                        <p>
                          {demoPersona === "alice"
                            ? "Your sent proposals and replies appear in the thread."
                            : "Switch to Alice, send a proposal, then come back here as Bob to accept or decline."}
                        </p>
                      </>
                    ) : selected?.name.toLowerCase().includes("demo peer") ? (
                      <>
                        <strong>Waiting for the demo proposal</strong>
                        <p>
                          Click <em>Refresh inbox</em> above. You should see &ldquo;Demo intro call&rdquo;
                          with time slots — pick one and click Accept.
                        </p>
                      </>
                    ) : (
                      <>
                        <strong>No messages yet</strong>
                        <p>Send a message below.</p>
                      </>
                    )}
                  </div>
                ) : (
                  visibleThread.map((item) => (
                    <ThreadItemView
                      key={item.id}
                      item={item}
                      busy={busy}
                      showActions={threadItemNeedsActions(
                        item,
                        respondedIds,
                        respondedTxnIds,
                        acceptedOfferIds,
                      )}
                      onAcceptSlot={(proposalId, slot) => {
                        void respondScheduling(proposalId, "accept", slot);
                      }}
                      onDeclineProposal={(proposalId) => void respondScheduling(proposalId, "decline")}
                      onRsvp={(rsvpId, response) => void respondRsvp(rsvpId, response)}
                      onConfirmTransaction={(transactionId, label) =>
                        void respondTransactionConfirm(transactionId, label)
                      }
                      onDeclineTransaction={(transactionId, label) =>
                        void respondTransactionDecline(transactionId, label)
                      }
                      onAcceptOffer={(offerId, intentId, label, amount) =>
                        void acceptCommerceOffer(offerId, intentId, label, amount)
                      }
                      onPollVote={(pollId, optionId) => void respondPollVote(pollId, optionId)}
                      onPaySplitShare={(splitId, label, amount) =>
                        void paySplitShare(splitId, label, amount)
                      }
                      onTttCell={(gameId, cell, mark) => void playTttCell(gameId, cell, mark)}
                      onBsFire={(gameId, cell) => void fireBsShot(gameId, cell)}
                      onDownloadIcs={(item) => downloadSchedulingIcs(item)}
                      sharedListItems={
                        item.kind === "shared-list"
                          ? sharedListStates.get(item.listId)?.items
                          : undefined
                      }
                      onSharedListChange={(listId, items) => void sendSharedListUpdate(listId, items)}
                    />
                  ))
                )}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
              </div>
              )}

              {!demoMode ? (
              <>
                {schedulingSuggested && !inlineModuleId ? (
                  <div className="comms-schedule-suggest">
                    <span>Arranging to meet?</span>
                    <button
                      type="button"
                      className="panel-btn"
                      disabled={busy || selected.blocked || !sessionReady || !modulesReady}
                      onClick={() => setInlineModuleId("scheduling/meeting-picker")}
                    >
                      Pick a time
                    </button>
                    <button
                      type="button"
                      className="comms-schedule-card-close"
                      aria-label="Dismiss scheduling suggestion"
                      onClick={() => setScheduleDismissedFor(lastThreadMessageId)}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                {modulesReady && inlineModuleId ? (
                  <div className="comms-inline-module">
                    <button
                      type="button"
                      className="comms-schedule-card-close comms-inline-module-close"
                      aria-label="Close module"
                      onClick={() => setInlineModuleId(null)}
                    >
                      ×
                    </button>
                    <CommsModuleEmbed
                      moduleId={inlineModuleId}
                      catalog={catalog}
                      registry={registry}
                      minHeight={
                        inlineModuleId === "games/tictactoe"
                          ? 180
                          : inlineModuleId === "games/battleships"
                            ? 280
                            : 72
                      }
                      props={{
                        peerName: contactDisplayName(selected),
                        defaultTitle: "Meeting",
                        mode:
                          inlineModuleId === "coordination/poll" ||
                          inlineModuleId === "coordination/shared-list" ||
                          inlineModuleId === "commerce/split-bill"
                            ? "compose"
                            : undefined,
                        ...(inlineModuleId === "games/battleships" ? bsInlineProps : {}),
                        ...(inlineModuleId === "scheduling/meeting-picker"
                          ? { busyEvents: webcalBusyEvents }
                          : {}),
                      }}
                      onEvent={handleModuleEvent}
                    />
                  </div>
                ) : null}
              <footer className="comms-compose">
                <textarea
                  className="panel-textarea"
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  placeholder={selected.blocked ? "Unblock to send messages…" : "Write a message…"}
                  rows={2}
                  aria-label="Message"
                  disabled={selected.blocked || busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <div className="comms-compose-actions">
                  <button
                    type="button"
                    className={`comms-compose-toggle${showPurchaseIntent ? " is-active" : ""}`}
                    aria-expanded={showPurchaseIntent}
                    onClick={() => setShowPurchaseIntent((open) => !open)}
                  >
                    Purchase
                  </button>
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={busy || !compose.trim() || selected.blocked}
                    onClick={() => void sendMessage()}
                  >
                    Send
                  </button>
                </div>
                {showPurchaseIntent ? (
                  <div className="comms-compose-row">
                    <input
                      className="panel-input"
                      value={intentQuery}
                      onChange={(e) => setIntentQuery(e.target.value)}
                      placeholder="Catalog query…"
                      aria-label="Purchase intent query"
                    />
                    <button
                      type="button"
                      className="panel-btn"
                      disabled={busy || !intentQuery.trim()}
                      onClick={() => void sendPurchaseIntent()}
                    >
                      Send intent
                    </button>
                  </div>
                ) : null}
              </footer>
              </>
              ) : null}
              </>
              ) : null}
            </>
          ) : (
            <div className="panel-empty comms-no-selection">
              <strong>Select a contact</strong>
              <p>
                {ATOM_BROWSER_MODE
                  ? "Choose someone from the list, use Discover, or add a contact with + Add."
                  : "Choose someone from the list, or open Setup to add a new contact."}
              </p>
            </div>
          )}
        </section>
      </div>

      {actionNote ? <p className="comms-toast">{actionNote}</p> : null}
    </aside>
  );
}
