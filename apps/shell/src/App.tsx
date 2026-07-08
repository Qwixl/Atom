import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AttestationLog,
  Catalog,
  ConversationRuntime,
  ModuleRegistry,
  createAttestationPersistence,
  createJsonPersistence,
  createTieredJsonPersistence,
  getGameEngine,
  listGameModuleIds,
  GameOrchestrator,
  findActiveGameInFeed,
  activeGameContext,
  allowCompositionDuringGame,
  sanitizeNewGameComposition,
  isGameEnded,
  isActiveShellGameOnFeed,
  loadBooleanFromStorage,
  loadJsonFromStorage,
  loadStringFromStorage,
  registerCorePrimitives,
  registerEcosystemModules,
  saveJsonToStorage,
  saveStringToStorage,
  type AgentSession,
  type AttestationEntry,
  type ConsequentialAction,
  type FeedItem,
  type JsonObject,
  type RegistryRevocation,
  type RegistryTrustPolicy,
  type UiEvent,
  type GameOrchestratorCallbacks,
} from "@qwixl/shell-core";
import { bridgeChatModuleEvent } from "./comms/moduleBridge.js";
import { CommsPanel } from "./CommsPanel.js";
import { ChatFeedSurface } from "./chat/ChatFeedSurface.js";
import { GameModal } from "./chat/GameModal.js";
import { FeedAgentText } from "./chat/FeedAgentText.js";
import { gameModuleLabel } from "./chat/gameModules.js";
import { buildGameStartComposition } from "./chat/startGameComposition.js";
import {
  buildLinkIntentMessage,
  friendlyLinkIntentLabel,
  type LinkIntentPayload,
} from "./chat/linkIntent.js";
import { DiscoveryBreadcrumb } from "./discovery/DiscoveryBreadcrumb.js";
import {
  appendDiscoveryStep,
  clearActiveDiscoveryPathId,
  enrichLinkIntentPayload,
  findDiscoveryPath,
  formatDiscoveryPathForPrompt,
  loadActiveDiscoveryPathId,
  loadDiscoveryPaths,
  saveActiveDiscoveryPathId,
  saveDiscoveryPaths,
  truncateDiscoveryPathToStep,
  type DiscoveryPath,
  type DiscoveryPathStep,
} from "./discovery/discoveryPath.js";
import { isDiscoveryTopicChange } from "./discovery/topicChange.js";
import {
  emergingInterestThemes,
  formatInterestConnectionsForPrompt,
  loadInterestConnections,
  saveInterestConnections,
  strengthenInterestConnection,
  themeFromTitle,
  type InterestConnection,
} from "./discovery/interestConnections.js";
import {
  buildPathIntersectOwnerMessage,
  detectPathIntersection,
  formatPathIntersectionForPrompt,
  loadDismissedIntersections,
  markIntersectionDismissed,
  mergeDiscoveryPaths,
  type PathIntersection,
} from "./discovery/pathIntersection.js";
import { findModuleEmbed, withModulePropDefaults } from "./chat/moduleEmbedDefaults.js";
import {
  LlmAgentSession,
  runCuratorPass,
  listOpenAiCompatibleModels,
  discoverModelCapabilities,
  inferModelCapabilities,
  normalizeModelCapabilityProfile,
  capabilitiesNeedRefresh,
  formatNativeToolsLabel,
  shouldCurateTranscript,
  type LlmConfig,
  type ModelCapabilityProfile,
  type AtomToolExecutor,
  type McpToolExecutor,
} from "@qwixl/agent-llm";
import { AgUiAgentSession, type AgUiAgentConfig } from "@qwixl/ag-ui-adapter";
import {
  OwnerStore,
  activeContextTags,
  buildPersonalAgentContext,
  mergeBusinessContextIntoProfile,
  ConversationMemoryIndex,
  type MemoryChunk,
  type OwnerRecord,
  type RecordProposal,
  recordUiPreferenceFeedback,
} from "@qwixl/owner-store";
import {
  createDefaultSecretStore,
  createProductionSecretStore,
  DEFAULT_LLM_SECRET_REF,
  isLlmConnectionReady,
  loadAndMigrateLlmConnection,
  loadLlmConnectionFromSession,
  LLM_CONNECTION_STORAGE_KEY,
  maskSecret,
  persistLlmConnection,
  persistLlmConnectionToSession,
  purgeInsecureLocalCredentials,
  resolveLlmConfig,
  DEFAULT_STRIPE_PAYMENT_REF,
  loadPaymentConnections,
  upsertPaymentConnection,
  type LlmConnectionConfig,
  type PaymentConnectionConfig,
  type SecretStore,
} from "@qwixl/secret-store";
import { MockAgentSession } from "./mock-agent.js";
import { loadBriefingPreferences, BRIEFING_OPEN_MESSAGE, applyCuratorBriefingTopics, formatBriefingContextForPrompt } from "./briefing/briefingPreferences.js";
import { BriefingSettingsPanel } from "./briefing/BriefingSettingsPanel.js";
import { ProfilePanel } from "./ProfilePanel.js";
import { DiscoverPanel } from "./DiscoverPanel.js";
import { RoomsPanel } from "./RoomsPanel.js";
import { tryReconnectHostedAgent } from "./auth/completeSetup.js";
import { loadAccountType, saveAccountType, clearAccountType } from "./accountType.js";
import { loadFirstRunDone, markFirstRunDone, resetFirstRunDone } from "./firstRunStorage.js";
import { navigate } from "./navigation.js";
import { DemoBootstrap } from "./DemoBootstrap.js";
import { PersonalDemoWalkthrough } from "./PersonalDemoWalkthrough.js";
import { calendarAddUrlFromAction } from "./calendarAddLink.js";
import { type DemoCalendarEvent } from "./demoScheduling.js";
import { CommsAgentClient } from "./comms/client.js";
import { commsClientAuth, mintChatSessionToken, refreshChatSessionToken, setChatSessionToken } from "./comms/chatSessionToken.js";
import {
  formatCalendarContextForPrompt,
  isWebcalConnected,
  loadWebcalBusyEvents,
  loadWebcalEvents,
  partitionEventsByToday,
  type WebcalBusyEvent,
} from "./comms/icalExport.js";
import {
  formatRssContextForPrompt,
  isRssConnected,
  loadRssItems,
} from "./comms/rssContext.js";
import { syncContactsToAgent } from "./comms/contactSync.js";
import {
  applyDemoPersona,
  loadDemoPersona,
  IS_DEMO_MODE,
} from "./demoPersonas.js";
import { CustodySecurityPanel } from "./custody/CustodySecurityPanel.js";
import { WebCalSettingsPanel } from "./connectors/WebCalSettingsPanel.js";
import { RssSettingsPanel } from "./connectors/RssSettingsPanel.js";
import { McpSettingsPanel } from "./connectors/McpSettingsPanel.js";
import { BookmarksSettingsPanel } from "./connectors/BookmarksSettingsPanel.js";
import {
  ConnectorModuleHost,
  WEBCAL_CONNECTOR_MODULE_ID,
} from "./connectors/ConnectorModuleHost.js";
import { requireCustodyApproval } from "./custody/approvalGate.js";
import {
  loadAttestations,
  loadOwnerProposals,
  loadOwnerRecords,
  saveAttestations,
  saveOwnerProposals,
  saveOwnerRecords,
} from "./custody/client.js";
import { loadCommsAgentConfig, loadCommsAgentConfigSecure, saveCommsAgentConfigSecure, clearCommsAdminToken, clearCommsAgentConfig, loadOwnerAgentKind, refreshCommsConfigCache, purgeStaleLocalAgentConfig, isLocalAgentUrl } from "./comms/storage.js";
import { probeAgentConnection, reconcileAgentConnection } from "./comms/agentConnection.js";
import { loadBrowserAgentConfig } from "./browserAgentConfig.js";
import { isVaultInitialized, isVaultUnlocked, lockVault } from "./custody/dataVault.js";
import { VaultUnlockGate } from "./custody/VaultUnlockGate.js";
import { RegistryCatalogList } from "./RegistryCatalogList.js";
import { loadContacts } from "./comms/storage.js";
import type { AgentContact } from "./comms/types.js";
import {
  ALLOW_BROWSER_LLM,
  ATOM_BROWSER_MODE,
  BUY_ME_A_COFFEE_URL,
  IS_PRODUCTION_HOST,
  MANAGED_HOSTING,
  PRODUCTION_REGISTRY_TRUST,
  PRODUCTION_REGISTRY_URL,
  SHOW_DEV_WORKFLOWS,
  usesSupabaseHostedAuth,
} from "./hostConfig.js";
import { AGUI_CONFIG_KEY, DEFAULT_AGUI_URL, agUiAuthHeaders, loadAgUiConfig, saveAgUiConfigForAgent } from "./agUiConfig.js";
import { validateProductionAgUiUrl } from "./productionGuard.js";
import { applyAtomSkin, ATOM_SKINS, isAtomSkinId, type AtomSkinId } from "@qwixl/skin-default/tokens";
import { FieldLabelWithHint, LlmApiKeyHintContent } from "./ui/FieldHint.js";
import { updateHostedLlmApiKey, signOutSupabase, fetchHostedAccountStatus } from "./auth/hostedAccount.js";
import { ShellComposer } from "./shell/ShellComposer.js";
import { ConfirmationChrome } from "./shell/ConfirmationChrome.js";
import { AtomShell } from "./shell/AtomShell.js";
import type { ShellNavPanel } from "./shell/ShellSidebar.js";

type Provider = "mock" | "llm" | "ag-ui";
type SidePanel = ShellNavPanel;

type ShellSession = AgentSession & { dispose?: () => void };

const SUGGESTIONS = [
  "Find a coffee shop",
  "Schedule a team standup next week",
  "RSVP to the design review",
  "What time works for our standup?",
];
const REGISTRY_URL_KEY = "atom-registry-url";
const REGISTRY_TRUST_KEY = "atom-registry-trust";
const CURATOR_ENABLED_KEY = "atom-curator-enabled";
const CURATOR_AUTO_ACCEPT_KEY = "atom-curator-auto-accept-open";
const SKIN_STORAGE_KEY = "atom-shell-skin";
const PROVIDER_KEY = "atom-provider";
const DEFAULT_REGISTRY_URL = "/registry/index.json";
const REVOCATION_REFRESH_MS = 5 * 60 * 1000;

function loadRegistryUrl(): string {
  if (IS_PRODUCTION_HOST) return PRODUCTION_REGISTRY_URL;
  return loadStringFromStorage(REGISTRY_URL_KEY)?.trim() || DEFAULT_REGISTRY_URL;
}

function loadRegistryTrust(): RegistryTrustPolicy {
  if (IS_PRODUCTION_HOST) return PRODUCTION_REGISTRY_TRUST;
  const parsed = loadJsonFromStorage<RegistryTrustPolicy>(REGISTRY_TRUST_KEY);
  if (!parsed) {
    return {
      requireIntegrity: true,
      trustedPublishers: PRODUCTION_REGISTRY_TRUST.trustedPublishers,
    };
  }
  return {
    requireIntegrity: parsed.requireIntegrity !== false,
    requireSignature: parsed.requireSignature === true,
    blockedIds: parsed.blockedIds?.filter(Boolean),
    trustedPublishers:
      parsed.trustedPublishers?.filter(Boolean) ?? PRODUCTION_REGISTRY_TRUST.trustedPublishers,
  };
}

function loadCuratorEnabled(): boolean {
  return loadBooleanFromStorage(CURATOR_ENABLED_KEY, true);
}

function loadCuratorAutoAcceptOpen(): boolean {
  return loadBooleanFromStorage(CURATOR_AUTO_ACCEPT_KEY, false);
}

function loadLlmConnection(store: SecretStore): LlmConnectionConfig | null {
  if (IS_PRODUCTION_HOST) {
    return loadLlmConnectionFromSession(store);
  }
  return loadAndMigrateLlmConnection(store);
}

function loadSavedProvider(store: SecretStore): Provider {
  if (IS_DEMO_MODE) return "mock";
  try {
    const saved = loadStringFromStorage(PROVIDER_KEY);
    if (saved === "llm" && ALLOW_BROWSER_LLM && isLlmConnectionReady(loadLlmConnection(store), store)) {
      return "llm";
    }
    if (saved === "ag-ui") return "ag-ui";
    if (saved === "mock" && SHOW_DEV_WORKFLOWS) return "mock";
  } catch {
    // fall through
  }
  return "ag-ui";
}

const attestationPersistence = createAttestationPersistence();
const ownerRecordsPersistence = createTieredJsonPersistence<OwnerRecord[]>({
  key: "atom-owner-store",
  validate: (value): value is OwnerRecord[] => Array.isArray(value),
});
const ownerProposalsPersistence = createTieredJsonPersistence<RecordProposal[]>({
  key: "atom-owner-proposals",
  validate: (value): value is RecordProposal[] => Array.isArray(value),
});
const conversationMemoryPersistence = createTieredJsonPersistence<MemoryChunk[]>({
  key: "atom-conversation-memory",
  validate: (value): value is MemoryChunk[] => Array.isArray(value),
});

type ChatFeedTextItem = { kind: "user" | "agent-text"; id: string; text: string };

const chatFeedPersistence = createJsonPersistence<ChatFeedTextItem[]>({
  key: "atom-chat-feed",
  validate: (value): value is ChatFeedTextItem[] => Array.isArray(value),
});

const CHAT_FEED_MAX_ITEMS = 200;

const COMMS_LAST_READ_KEY = "atom-comms-last-read";

/** Persist only text turns; module surfaces are session-scoped and not serializable. */
function persistableChatFeed(feed: readonly FeedItem[]): ChatFeedTextItem[] {
  return feed
    .filter(
      (item): item is Extract<FeedItem, { kind: "user" | "agent-text" }> =>
        item.kind === "user" || item.kind === "agent-text",
    )
    .map(({ kind, id, text }) => ({ kind, id, text }))
    .slice(-CHAT_FEED_MAX_ITEMS);
}

function restoredChatFeed(): FeedItem[] {
  const stored = chatFeedPersistence.load();
  if (!stored) return [];
  return stored.filter(
    (item) =>
      (item.kind === "user" || item.kind === "agent-text") &&
      typeof item.id === "string" &&
      typeof item.text === "string",
  );
}

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    registerEcosystemModules(c);
    return c;
  }, []);

  const attestationLog = useMemo(
    () =>
      new AttestationLog({
        persist: (entries) => {
          const config = loadCommsAgentConfig();
          if (config.adminToken?.trim()) {
            void saveAttestations(config, entries);
            return;
          }
          attestationPersistence.save([...entries]);
        },
        restore: attestationPersistence.load() as AttestationEntry[] | undefined,
      }),
    [],
  );

  const ownerStore = useMemo(
    () =>
      new OwnerStore({
        persist: (records) => {
          const config = loadCommsAgentConfig();
          if (config.adminToken?.trim()) {
            void saveOwnerRecords(config, records);
            return;
          }
          ownerRecordsPersistence.save([...records]);
        },
        restore: ownerRecordsPersistence.load(),
        persistProposals: (proposals) => {
          const config = loadCommsAgentConfig();
          if (config.adminToken?.trim()) {
            void saveOwnerProposals(config, proposals);
            return;
          }
          ownerProposalsPersistence.save([...proposals]);
        },
        restoreProposals: ownerProposalsPersistence.load(),
      }),
    [],
  );

  const secretStore = useMemo(
    () => (IS_PRODUCTION_HOST ? createProductionSecretStore() : createDefaultSecretStore()),
    [],
  );

  const [agentConnectionReady, setAgentConnectionReady] = useState(false);
  const [agentBootstrapPending, setAgentBootstrapPending] = useState(!IS_DEMO_MODE);
  const [vaultUnlocked, setVaultUnlocked] = useState(() => !isVaultInitialized() || isVaultUnlocked());

  useEffect(() => {
    if (IS_PRODUCTION_HOST) purgeInsecureLocalCredentials(LLM_CONNECTION_STORAGE_KEY);
    if (MANAGED_HOSTING && purgeStaleLocalAgentConfig()) {
      resetFirstRunDone();
    }
  }, []);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setAgentConnectionReady(true);
      return;
    }
    void (async () => {
      const finishConnected = (adminUrl?: string) => {
        if (adminUrl?.trim()) {
          setAgUiConfig(saveAgUiConfigForAgent(adminUrl));
        }
        setAgentConnectionReady(true);
        markFirstRunDone();
        if (isVaultInitialized() && !isVaultUnlocked()) {
          setVaultUnlocked(false);
        }
      };

      if ((await reconcileAgentConnection()) === "ok") {
        await refreshCommsConfigCache();
        finishConnected((await loadCommsAgentConfigSecure()).adminUrl);
        setAgentBootstrapPending(false);
        return;
      }

      if (ATOM_BROWSER_MODE) {
        const browserConfig = loadBrowserAgentConfig();
        if (browserConfig) {
          await saveCommsAgentConfigSecure(browserConfig);
          if ((await probeAgentConnection(browserConfig)) === "ok") {
            await refreshCommsConfigCache();
            finishConnected(browserConfig.adminUrl);
            setAgentBootstrapPending(false);
            return;
          }
        }
        setAgentConnectionReady(false);
        setAgentBootstrapPending(false);
        return;
      }

      const stored = await loadCommsAgentConfigSecure();

      if (MANAGED_HOSTING && stored.adminUrl && isLocalAgentUrl(stored.adminUrl)) {
        clearCommsAgentConfig();
        resetFirstRunDone();
        setAgentConnectionReady(false);
        navigate("/app/?auth=register", true);
        setAgentBootstrapPending(false);
        return;
      }

      if (stored.adminToken?.trim()) {
        const status = await probeAgentConnection(stored);
        if (status === "ok") {
          await refreshCommsConfigCache();
          finishConnected(stored.adminUrl);
          setAgentBootstrapPending(false);
          return;
        }
        if (MANAGED_HOSTING && loadOwnerAgentKind(stored) === "hosted") {
          if (await tryReconnectHostedAgent()) {
            await refreshCommsConfigCache();
            finishConnected((await loadCommsAgentConfigSecure()).adminUrl);
            setAgentBootstrapPending(false);
            return;
          }
        }
      } else if (MANAGED_HOSTING) {
        if (await tryReconnectHostedAgent()) {
          await refreshCommsConfigCache();
          finishConnected((await loadCommsAgentConfigSecure()).adminUrl);
          setAgentBootstrapPending(false);
          return;
        }
      }

      // Local dev: never block the shell with a signup wizard. Configure once in Comms → Setup.
      if (SHOW_DEV_WORKFLOWS) {
        markFirstRunDone();
        setAgentConnectionReady(false);
        setAgentBootstrapPending(false);
        return;
      }

      setAgentConnectionReady(false);
      resetFirstRunDone();
      navigate("/app/?auth=register", true);
      setAgentBootstrapPending(false);
    })();
  }, []);

  useEffect(() => {
    if (!vaultUnlocked) return;
    void refreshCommsConfigCache();
  }, [vaultUnlocked]);

  const handleAgentAuthFailure = useCallback(() => {
    clearCommsAdminToken();
    if (MANAGED_HOSTING) {
      clearCommsAgentConfig();
      resetFirstRunDone();
    }
    setAgentConnectionReady(false);
    navigate("/app/?auth=login", true);
  }, []);

  const handleLogout = useCallback(async () => {
    lockVault();
    clearCommsAgentConfig();
    clearAccountType();
    resetFirstRunDone();
    if (usesSupabaseHostedAuth()) {
      await signOutSupabase();
    }
    window.location.href = "/app/?auth=login";
  }, []);

  useEffect(() => {
    if (!vaultUnlocked) {
      setChatSessionToken(null);
      return;
    }
    void (async () => {
      const config = await loadCommsAgentConfigSecure();
      if (!config.adminToken?.trim()) {
        setChatSessionToken(null);
        return;
      }
      setChatSessionToken(await mintChatSessionToken(config));
    })();
  }, [vaultUnlocked, agentConnectionReady]);

  useEffect(() => {
    if (!agentConnectionReady || !vaultUnlocked) return;
    void (async () => {
      try {
        const config = await loadCommsAgentConfigSecure();
        if (!config.adminToken?.trim()) return;
        const [remoteRecords, remoteProposals, remoteAttestations] = await Promise.all([
          loadOwnerRecords<OwnerRecord>(config),
          loadOwnerProposals<RecordProposal>(config),
          loadAttestations<AttestationEntry>(config),
        ]);
        const localRecords = ownerRecordsPersistence.load() ?? [];
        const localProposals = ownerProposalsPersistence.load() ?? [];
        if (remoteRecords.length === 0 && localRecords.length > 0) {
          for (const record of localRecords) {
            ownerStore.upsert(record);
          }
          await saveOwnerRecords(config, ownerStore.list());
          ownerRecordsPersistence.clear();
        } else if (remoteRecords.length > 0) {
          for (const record of remoteRecords) {
            ownerStore.upsert(record);
          }
        }
        if (remoteProposals.length === 0 && localProposals.length > 0) {
          await saveOwnerProposals(config, localProposals);
          ownerProposalsPersistence.clear();
        }
        if (remoteAttestations.length > 0) {
          setAttestations(remoteAttestations);
        }
        setProfileRecords(ownerStore.list());
        setProfileProposals(ownerStore.listProposals());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unauthorized|401/i.test(message)) {
          clearCommsAdminToken();
          setAgentConnectionReady(false);
          navigate("/app/?auth=login", true);
          return;
        }
        console.warn("[custody] backend hydrate failed", error);
      }
    })();
  }, [ownerStore, agentConnectionReady, vaultUnlocked]);

  const [provider, setProvider] = useState<Provider>(() => loadSavedProvider(secretStore));
  const [llmConnection, setLlmConnection] = useState<LlmConnectionConfig | null>(() =>
    loadLlmConnection(secretStore),
  );
  const llmConfig = useMemo((): LlmConfig | null => {
    if (!llmConnection) return null;
    const resolved = resolveLlmConfig(llmConnection, secretStore);
    if (!resolved) return null;
    return {
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      capabilities: normalizeModelCapabilityProfile(
        resolved.capabilities as Partial<ModelCapabilityProfile> | undefined,
        { baseUrl: resolved.baseUrl, model: resolved.model },
      ),
    };
  }, [llmConnection, secretStore]);

  useEffect(() => {
    if (!ALLOW_BROWSER_LLM || provider !== "llm" || !llmConnection) return;
    const resolved = resolveLlmConfig(llmConnection, secretStore);
    if (!resolved?.apiKey.trim()) return;
    const current = resolved.capabilities as ModelCapabilityProfile | undefined;
    if (
      !capabilitiesNeedRefresh(current, {
        baseUrl: resolved.baseUrl,
        model: resolved.model,
      })
    ) {
      return;
    }
    let cancelled = false;
    void discoverModelCapabilities({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      probe: true,
    })
      .then((profile) => {
        if (cancelled) return;
        const connection: LlmConnectionConfig = { ...llmConnection, capabilities: profile };
        persistLlmConnection(connection);
        setLlmConnection(connection);
      })
      .catch(() => {
        /* keep normalized fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [llmConnection, provider, secretStore]);

  const savedLlmKeyHint = useMemo(() => {
    if (!llmConnection) return null;
    const key = secretStore.get(llmConnection.secretRef);
    return key ? maskSecret(key) : null;
  }, [llmConnection, secretStore]);
  const [paymentConnections, setPaymentConnections] = useState<PaymentConnectionConfig[]>(() =>
    loadPaymentConnections(),
  );
  const stripePayment = useMemo(
    () => paymentConnections.find((c) => c.provider === "stripe") ?? null,
    [paymentConnections],
  );
  const savedStripeSecretHint = useMemo(() => {
    if (!stripePayment) return null;
    const key = secretStore.get(stripePayment.secretRef);
    return key ? maskSecret(key) : null;
  }, [stripePayment, secretStore]);
  const [agUiConfig, setAgUiConfig] = useState<AgUiAgentConfig>(() => loadAgUiConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!agentConnectionReady || IS_DEMO_MODE) return;
    const config = loadCommsAgentConfig();
    if (!config.adminUrl?.trim()) return;
    if (!agUiConfig.url.trim()) {
      setAgUiConfig(saveAgUiConfigForAgent(config.adminUrl));
    }
    if (MANAGED_HOSTING && provider !== "ag-ui") {
      saveStringToStorage(PROVIDER_KEY, "ag-ui");
      setProvider("ag-ui");
    }
  }, [agentConnectionReady, agUiConfig.url, provider]);

  const ownerAgentSummary = useMemo(() => {
    if (agentBootstrapPending) return "Starting…";
    if (!agentConnectionReady) {
      if (ATOM_BROWSER_MODE) return "Starting your agent…";
      return SHOW_DEV_WORKFLOWS
        ? "Connect your agent in Messages → Setup"
        : "Create your account to get started";
    }
    if (!vaultUnlocked) return "Unlock your vault to finish connecting";
    const kind = loadOwnerAgentKind(loadCommsAgentConfig());
    return kind === "hosted" ? "Hosted agent connected" : "Your agent is connected";
  }, [agentBootstrapPending, agentConnectionReady, vaultUnlocked, ATOM_BROWSER_MODE, SHOW_DEV_WORKFLOWS]);

  const chatProviderSummary = useMemo(() => {
    if (provider === "mock") return "mock chat";
    if (provider === "ag-ui") {
      return `ag-ui · ${agUiConfig.url.replace(/^https?:\/\//, "")}`;
    }
    return llmConfig ? `live chat · ${llmConfig.model}` : "live chat (not configured)";
  }, [provider, agUiConfig.url, llmConfig]);
  const [demoReady, setDemoReady] = useState(() => !IS_DEMO_MODE);
  const [demoBootstrapError, setDemoBootstrapError] = useState<string | null>(null);
  const [demoScheduleSent, setDemoScheduleSent] = useState(false);
  const [demoCalendarAdded, setDemoCalendarAdded] = useState(false);
  const [demoWebcalReady, setDemoWebcalReady] = useState(false);
  const [demoCalendarEvents, setDemoCalendarEvents] = useState<DemoCalendarEvent[]>([]);
  const [webcalBusyEvents, setWebcalBusyEvents] = useState<WebcalBusyEvent[]>([]);
  const [calendarContext, setCalendarContext] = useState<string | undefined>(undefined);
  const calendarContextRef = useRef<string | undefined>(undefined);
  const webcalRefreshInFlight = useRef<Promise<void> | null>(null);
  const [rssContext, setRssContext] = useState<string | undefined>(undefined);
  const rssContextRef = useRef<string | undefined>(undefined);
  const rssRefreshInFlight = useRef<Promise<void> | null>(null);

  const applyCalendarContext = useCallback((value: string | undefined) => {
    calendarContextRef.current = value;
    setCalendarContext(value);
  }, []);
  const applyRssContext = useCallback((value: string | undefined) => {
    rssContextRef.current = value;
    setRssContext(value);
  }, []);
  /** Set when user picks a provider that needs configuration first. */
  const [settingsIntent, setSettingsIntent] = useState<Provider | null>(null);
  const [input, setInput] = useState("");
  const [attestations, setAttestations] = useState<readonly AttestationEntry[]>(
    attestationLog.list(),
  );
  const [commsPending, setCommsPending] = useState<{
    action: ConsequentialAction;
    resolve: (
      result:
        | { decision: "declined" }
        | { decision: "approved"; attestationRef: string; approvalRef: string },
    ) => void;
  } | null>(null);
  const [custodyError, setCustodyError] = useState<string | null>(null);
  const [panel, setPanel] = useState<SidePanel>(() => "none");

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("atom-open-comms") === "1") {
      sessionStorage.removeItem("atom-open-comms");
      setPanel("comms");
    }
  }, []);
  const [roomsFocusId, setRoomsFocusId] = useState<string | null>(null);
  const [commsFocusId, setCommsFocusId] = useState<string | null>(null);
  const [commsContacts, setCommsContacts] = useState<AgentContact[]>(() =>
    loadContacts(ownerRecordsPersistence.load()),
  );

  useEffect(() => {
    if (IS_DEMO_MODE || !agentConnectionReady) return;
    const config = loadCommsAgentConfig();
    if (!config.adminToken?.trim()) return;
    const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
    void syncContactsToAgent(client, commsContacts).catch(() => {
      /* policy sync is best-effort until agent is reachable */
    });
  }, [commsContacts, agentConnectionReady]);

  const [commsUnreadCount, setCommsUnreadCount] = useState(0);

  useEffect(() => {
    if (IS_DEMO_MODE || !agentConnectionReady) return;
    if (panel === "comms") {
      saveStringToStorage(COMMS_LAST_READ_KEY, new Date().toISOString());
      setCommsUnreadCount(0);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const config = loadCommsAgentConfig();
      if (!config.adminToken?.trim()) return;
      try {
        const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
        const entries = await client.inbox();
        if (cancelled) return;
        const lastRead = loadStringFromStorage(COMMS_LAST_READ_KEY) ?? "";
        setCommsUnreadCount(
          entries.filter((entry) => !lastRead || entry.receivedAt > lastRead).length,
        );
      } catch {
        /* unread badge is best-effort; status errors surface in the panel */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentConnectionReady, panel]);

  const [profileRecords, setProfileRecords] = useState<OwnerRecord[]>(ownerStore.list());
  const [profileProposals, setProfileProposals] = useState<RecordProposal[]>(
    ownerStore.listProposals(),
  );

  useEffect(() => {
    void (async () => {
      const [records] = await Promise.all([
        ownerRecordsPersistence.hydrateFromIndexedDb(),
        ownerProposalsPersistence.hydrateFromIndexedDb(),
        conversationMemoryPersistence.hydrateFromIndexedDb(),
      ]);
      if (!records?.length || ownerStore.list().length > 0) return;
      for (const record of records) {
        ownerStore.upsert(record);
      }
      setProfileRecords(ownerStore.list());
      setCommsContacts(loadContacts(records));
    })();
  }, [ownerStore]);

  const [curatorEnabled, setCuratorEnabled] = useState(() => loadCuratorEnabled());
  const [curatorAutoAcceptOpen, setCuratorAutoAcceptOpen] = useState(() =>
    loadCuratorAutoAcceptOpen(),
  );
  const [modulesEnabled, setModulesEnabled] = useState(true);
  const [accountType, setAccountType] = useState(() => loadAccountType());
  const showModulesToggle = SHOW_DEV_WORKFLOWS || accountType === "developer";
  const modulesActive = showModulesToggle ? modulesEnabled : true;
  const [registryUrl, setRegistryUrl] = useState(() => loadRegistryUrl());
  const [registryTrust, setRegistryTrust] = useState(() => loadRegistryTrust());
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [revokedModules, setRevokedModules] = useState<readonly RegistryRevocation[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const [discoveryPaths, setDiscoveryPaths] = useState<DiscoveryPath[]>(() => loadDiscoveryPaths());
  const [activeDiscoveryPathId, setActiveDiscoveryPathId] = useState<string | null>(() =>
    loadActiveDiscoveryPathId(),
  );
  const activeDiscoveryPath = useMemo(
    () => findDiscoveryPath(discoveryPaths, activeDiscoveryPathId),
    [discoveryPaths, activeDiscoveryPathId],
  );
  const discoveryPathContextRef = useRef<string>("");
  discoveryPathContextRef.current = formatDiscoveryPathForPrompt(activeDiscoveryPath);
  const [interestConnections, setInterestConnections] = useState<InterestConnection[]>(() =>
    loadInterestConnections(),
  );
  const interestConnectionsRef = useRef(interestConnections);
  interestConnectionsRef.current = interestConnections;
  const interestConnectionsContextRef = useRef("");
  interestConnectionsContextRef.current = formatInterestConnectionsForPrompt(interestConnections);
  const [dismissedIntersections, setDismissedIntersections] = useState<Set<string>>(() =>
    loadDismissedIntersections(),
  );
  const pendingIntersectionRef = useRef<PathIntersection | null>(null);
  const pathIntersectionContextRef = useRef("");
  const activeIntersection = useMemo(
    () => detectPathIntersection(activeDiscoveryPath, discoveryPaths, dismissedIntersections),
    [activeDiscoveryPath, discoveryPaths, dismissedIntersections],
  );
  pendingIntersectionRef.current = activeIntersection;
  pathIntersectionContextRef.current = formatPathIntersectionForPrompt(activeIntersection);
  const turnTranscript = useRef<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const lastUserMessageRef = useRef("");
  const sessionContextTagsRef = useRef<string[]>([]);
  const chatFeedRef = useRef<readonly FeedItem[]>(restoredChatFeed());
  // Ended games restored from persistence start dismissed so the modal
  // doesn't pop open on page load just to show a finished board.
  const [gameModalDismissedId, setGameModalDismissedId] = useState<string | null>(() => {
    const restored = findActiveGameInFeed(chatFeedRef.current);
    if (!restored) return null;
    const props = withModulePropDefaults(restored.embed.moduleId, restored.embed.props);
    return isGameEnded(props) ? restored.surface.surfaceId : null;
  });
  const [gameNotice, setGameNotice] = useState<string | null>(null);
  const prevGameSurfaceIdRef = useRef<string | null>(
    findActiveGameInFeed(chatFeedRef.current)?.surface.surfaceId ?? null,
  );
  const gameOrchestratorRef = useRef(new GameOrchestrator());
  const gameCallbacksRef = useRef<GameOrchestratorCallbacks>({
    getActiveGame: () => null,
    commitProps: () => {},
    appendAgentText: () => {},
    requestAgentTurn: () => {},
  });
  const conversationMemory = useMemo(
    () =>
      new ConversationMemoryIndex({
        restore: conversationMemoryPersistence.load() ?? [],
        persist: (chunks) => conversationMemoryPersistence.save([...chunks]),
      }),
    [],
  );
  const conversationMemoryRef = useRef(conversationMemory);
  conversationMemoryRef.current = conversationMemory;

  const buildContext = useCallback(
    () => {
      const briefing = loadBriefingPreferences();
      const interestHints = emergingInterestThemes(interestConnectionsRef.current, 5).map(
        (entry) => entry.theme,
      );
      const memoryQuery =
        lastUserMessageRef.current.trim() ||
        (briefing.topics.length > 0
          ? `briefing interests: ${briefing.topics.join(", ")}`
          : interestHints.length > 0
            ? `briefing interests: ${interestHints.join(", ")}`
            : undefined);
      const base = mergeBusinessContextIntoProfile(
        ownerStore,
        buildPersonalAgentContext(ownerStore, conversationMemory, memoryQuery, {
          sessionContextTags: sessionContextTagsRef.current,
          memoryLimit: 5,
        }),
      );
      const calendar =
        calendarContextRef.current ??
        "Not connected. Owner can add a private ICS feed URL in Settings → Connectors.";
      const rss =
        rssContextRef.current ??
        "Not connected. Owner can add a public RSS/Atom feed URL in Settings → Connectors.";
      const withCalendar = { ...base, calendarContext: calendar, rssContext: rss };
      const briefingContext = formatBriefingContextForPrompt(briefing, interestHints);
      const withBriefing = briefingContext
        ? { ...withCalendar, briefingContext }
        : withCalendar;
      const discoveryPathContext = discoveryPathContextRef.current.trim();
      const withDiscovery = discoveryPathContext
        ? { ...withBriefing, discoveryPathContext }
        : withBriefing;
      const interestConnectionsContext = interestConnectionsContextRef.current.trim();
      const withInterests = interestConnectionsContext
        ? { ...withDiscovery, interestConnectionsContext }
        : withDiscovery;
      const pathIntersectionContext = pathIntersectionContextRef.current.trim();
      const withIntersection = pathIntersectionContext
        ? { ...withInterests, pathIntersectionContext }
        : withInterests;
      const active = activeGameContext(findActiveGameInFeed(chatFeedRef.current));
      return active ? { ...withIntersection, activeSurface: active } : withIntersection;
    },
    [ownerStore, conversationMemory],
  );
  const buildContextRef = useRef(buildContext);
  buildContextRef.current = buildContext;
  const profileProvider = useCallback(() => buildContextRef.current(), []);

  const registry = useMemo(
    () => new ModuleRegistry({ indexUrl: registryUrl, trust: registryTrust }),
    [registryUrl, registryTrust],
  );

  const loadDemoWebcalEvents = useCallback(async (): Promise<DemoCalendarEvent[]> => {
    const config = loadCommsAgentConfig();
    const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
    return loadWebcalBusyEvents(client);
  }, []);
  const demoWebcalReadyRef = useRef(demoWebcalReady);
  demoWebcalReadyRef.current = demoWebcalReady;
  const loadDemoWebcalEventsRef = useRef(loadDemoWebcalEvents);
  loadDemoWebcalEventsRef.current = loadDemoWebcalEvents;
  const mockWebcalEventsProvider = useCallback(async () => {
    if (!demoWebcalReadyRef.current) return [];
    return loadDemoWebcalEventsRef.current();
  }, []);

  const refreshWebcalState = useCallback(async () => {
    if (webcalRefreshInFlight.current) {
      await webcalRefreshInFlight.current;
      return;
    }

    const run = async () => {
    const config = vaultUnlocked
      ? await loadCommsAgentConfigSecure()
      : loadCommsAgentConfig();
    if (!config.adminToken?.trim()) {
      setDemoWebcalReady(false);
      setDemoCalendarEvents([]);
      setWebcalBusyEvents([]);
      applyCalendarContext(
        formatCalendarContextForPrompt({
          connected: false,
          todayEvents: [],
          upcomingEvents: [],
        }),
      );
      return;
    }
    try {
      const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
      const connected = await isWebcalConnected(client);
      setDemoWebcalReady(connected);
      if (!connected) {
        setDemoCalendarEvents([]);
        setWebcalBusyEvents([]);
        applyCalendarContext(formatCalendarContextForPrompt({
          connected: false,
          todayEvents: [],
          upcomingEvents: [],
        }));
        return;
      }
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const allEvents = await loadWebcalEvents(client, startOfDay, week);
      const { todayEvents, upcomingEvents } = partitionEventsByToday(allEvents, now);
      setDemoCalendarEvents(allEvents);
      setWebcalBusyEvents(allEvents);
      applyCalendarContext(
        formatCalendarContextForPrompt({ connected: true, todayEvents, upcomingEvents }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDemoWebcalReady(false);
      setDemoCalendarEvents([]);
      setWebcalBusyEvents([]);
      applyCalendarContext(
        formatCalendarContextForPrompt({
          connected: false,
          todayEvents: [],
          upcomingEvents: [],
          error: message,
        }),
      );
    }
    };

    const task = run().finally(() => {
      webcalRefreshInFlight.current = null;
    });
    webcalRefreshInFlight.current = task;
    await task;
  }, [vaultUnlocked, applyCalendarContext]);

  const refreshRssState = useCallback(async () => {
    if (rssRefreshInFlight.current) {
      await rssRefreshInFlight.current;
      return;
    }

    const run = async () => {
      const config = vaultUnlocked
        ? await loadCommsAgentConfigSecure()
        : loadCommsAgentConfig();
      if (!config.adminToken?.trim()) {
        applyRssContext(
          formatRssContextForPrompt({
            connected: false,
            items: [],
          }),
        );
        return;
      }
      try {
        const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
        const connected = await isRssConnected(client);
        if (!connected) {
          applyRssContext(formatRssContextForPrompt({ connected: false, items: [] }));
          return;
        }
        const { items, feedLabels } = await loadRssItems(client, 25);
        applyRssContext(formatRssContextForPrompt({ connected: true, items, feedLabels }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        applyRssContext(
          formatRssContextForPrompt({
            connected: false,
            items: [],
            error: message,
          }),
        );
      }
    };

    const task = run().finally(() => {
      rssRefreshInFlight.current = null;
    });
    rssRefreshInFlight.current = task;
    await task;
  }, [vaultUnlocked, applyRssContext]);

  const refreshDemoWebcalState = useCallback(async () => {
    await refreshWebcalState();
  }, [refreshWebcalState]);

  useEffect(() => {
    if (!IS_DEMO_MODE) return;
    applyDemoPersona(loadDemoPersona());
  }, []);

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    if (!vaultUnlocked) return;
    void refreshWebcalState();
    void refreshRssState();
  }, [vaultUnlocked, refreshWebcalState, refreshRssState]);

  useEffect(() => {
    if (!IS_DEMO_MODE || !demoReady) return;
    void refreshDemoWebcalState();
    const timer = window.setInterval(() => void refreshDemoWebcalState(), 4000);
    return () => window.clearInterval(timer);
  }, [demoReady, refreshDemoWebcalState]);

  useEffect(() => {
    if (!MANAGED_HOSTING || !usesSupabaseHostedAuth()) return;
    void fetchHostedAccountStatus()
      .then((status) => {
        if (status.accountType) {
          saveAccountType(status.accountType);
          setAccountType(status.accountType);
        }
      })
      .catch(() => {
        /* keep cached account type */
      });
  }, []);

  useEffect(() => {
    if (!modulesActive) {
      registry.uninstallAll(catalog);
    }
  }, [modulesActive, catalog, registry]);

  useEffect(() => {
    let cancelled = false;
    void registry.loadRevocations().then(() => {
      if (!cancelled) setRevokedModules(registry.listRevoked());
    });
    return () => {
      cancelled = true;
    };
  }, [registry, registryUrl]);

  useEffect(() => {
    if (!modulesActive) return;
    let cancelled = false;

    const syncRevocations = async () => {
      try {
        const evicted = await registry.syncRevocations(catalog);
        if (cancelled) return;
        setRevokedModules(registry.listRevoked());
        if (evicted.length > 0) {
          const labels = evicted.map((item) => `${item.id}@${item.version}`).join(", ");
          setRegistryError(`Revoked modules removed: ${labels}`);
        }
      } catch (error) {
        if (!cancelled) {
          setRegistryError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void syncRevocations();
    const timer = window.setInterval(() => void syncRevocations(), REVOCATION_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [modulesActive, registry, catalog, registryUrl]);

  useEffect(() => {
    if (!modulesActive) return;
    void registry.ensureSystemModules(catalog).catch((error) => {
      setRegistryError(error instanceof Error ? error.message : String(error));
    });
  }, [modulesActive, registry, catalog, registryUrl]);

  /** Promote persisted non-guarded curator proposals into open profile records. */
  useEffect(() => {
    if (!curatorAutoAcceptOpen) return;
    const accepted = ownerStore.acceptOpenProposals();
    if (accepted > 0) {
      setProfileRecords(ownerStore.list());
      setProfileProposals(ownerStore.listProposals());
    }
  }, [ownerStore, curatorAutoAcceptOpen]);

  const atomToolExecutor = useCallback<AtomToolExecutor>(async (call) => {
    const config = vaultUnlocked
      ? await loadCommsAgentConfigSecure()
      : loadCommsAgentConfig();
    if (!config.adminToken?.trim()) {
      throw new Error(
        "Atom connectors need your Messages agent running (pnpm start:agent) and connected in Settings.",
      );
    }
    const invokeOnce = async () => {
      const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
      const response = await client.invokeConnector(
        call.connectorId,
        call.operation,
        call.input ?? {},
      );
      return response.result;
    };
    try {
      return await invokeOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/unauthorized|401|403|session token|expired/i.test(message)) throw error;
      const refreshed = await refreshChatSessionToken(config);
      if (!refreshed) throw error;
      return await invokeOnce();
    }
  }, [vaultUnlocked]);

  const mcpToolExecutor = useCallback<McpToolExecutor>(async (call) => {
    const config = vaultUnlocked
      ? await loadCommsAgentConfigSecure()
      : loadCommsAgentConfig();
    if (!config.adminToken?.trim()) {
      throw new Error(
        "MCP tools need your Messages agent running (pnpm start:agent) and connected in Settings.",
      );
    }
    const invokeOnce = async () => {
      const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
      const response = await client.invokeMcpTool(
        call.serverId,
        call.toolName,
        call.arguments ?? {},
      );
      return response.result;
    };
    try {
      return await invokeOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/unauthorized|401|403|session token|expired/i.test(message)) throw error;
      const refreshed = await refreshChatSessionToken(config);
      if (!refreshed) throw error;
      return await invokeOnce();
    }
  }, [vaultUnlocked]);

  const agUiSessionKey = provider === "ag-ui" ? agUiConfig.url : null;

  const session: ShellSession = useMemo(() => {
    if (provider === "llm" && llmConfig) {
      return new LlmAgentSession(llmConfig, catalog, profileProvider, {
        atomToolExecutor,
        atomConnectorsAvailable: agentConnectionReady && !IS_DEMO_MODE,
        mcpToolExecutor,
        mcpServersAvailable: agentConnectionReady && !IS_DEMO_MODE,
      });
    }
    if (provider === "ag-ui") {
      const comms = loadCommsAgentConfig();
      return new AgUiAgentSession({
        ...agUiConfig,
        headers: agUiAuthHeaders(comms.adminToken),
        profileProvider,
        connectorExecutor: atomToolExecutor,
        connectorsAvailable: agentConnectionReady && !IS_DEMO_MODE,
      });
    }
    return new MockAgentSession({
      profileProvider,
      webcalEventsProvider: mockWebcalEventsProvider,
    });
  }, [provider, llmConfig, agUiSessionKey, catalog, profileProvider, mockWebcalEventsProvider, atomToolExecutor, mcpToolExecutor, agentConnectionReady]);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const briefingOpenSentRef = useRef(false);
  useEffect(() => {
    if (IS_DEMO_MODE || !vaultUnlocked || !agentConnectionReady || provider !== "llm") return;
    const prefs = loadBriefingPreferences();
    if (!prefs.enabled || briefingOpenSentRef.current) return;
    briefingOpenSentRef.current = true;
    sessionRef.current.sendUserMessage(BRIEFING_OPEN_MESSAGE);
  }, [vaultUnlocked, agentConnectionReady, provider]);

  const prevSessionRef = useRef<ShellSession | null>(null);

  const modulesActiveRef = useRef(modulesActive);
  modulesActiveRef.current = modulesActive;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const ownerStoreRef = useRef(ownerStore);
  ownerStoreRef.current = ownerStore;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const llmConfigRef = useRef(llmConfig);
  llmConfigRef.current = llmConfig;
  const curatorEnabledRef = useRef(curatorEnabled);
  curatorEnabledRef.current = curatorEnabled;
  const curatorAutoAcceptOpenRef = useRef(curatorAutoAcceptOpen);
  curatorAutoAcceptOpenRef.current = curatorAutoAcceptOpen;
  const setRegistryErrorRef = useRef(setRegistryError);
  setRegistryErrorRef.current = setRegistryError;
  const setPanelRef = useRef(setPanel);
  setPanelRef.current = setPanel;
  const setProfileRecordsRef = useRef(setProfileRecords);
  setProfileRecordsRef.current = setProfileRecords;
  const setProfileProposalsRef = useRef(setProfileProposals);
  setProfileProposalsRef.current = setProfileProposals;
  /** Set while an owner chrome Games menu launch is in flight. */
  const ownerStartGameRef = useRef(false);

  const conversation = useMemo(
    () =>
      new ConversationRuntime({
        catalog,
        restoreFeed: restoredChatFeed(),
        onFeedChange: (feed) => {
          chatFeedRef.current = feed;
          chatFeedPersistence.save(persistableChatFeed(feed));
        },
        beforeResolveComposition: async (composition) => {
          sanitizeNewGameComposition(composition);
          if (!modulesActiveRef.current) return;
          setRegistryErrorRef.current(null);
          await registryRef.current.ensureModules(catalogRef.current, composition);
        },
        shouldReplaceSurface: (composition, feed) =>
          allowCompositionDuringGame(composition, feed, {
            ownerStart: ownerStartGameRef.current,
          }),
        shouldAppendAgentText: (_text, feed) => !isActiveShellGameOnFeed(feed),
        onRegistryError: (message) => setRegistryErrorRef.current(message),
        onGameMove: (surfaceId, move) =>
          gameOrchestratorRef.current.handleAgentMove(surfaceId, move, gameCallbacksRef.current),
        guardedRecordCount: (categories) =>
          ownerStoreRef.current.guardedRecords(categories).length,
        onTranscriptLine: (role, text) => {
          if (role === "user" && text.startsWith("[game-turn]")) return;
          if (role === "assistant" && isActiveShellGameOnFeed(chatFeedRef.current)) return;
          if (role === "user") lastUserMessageRef.current = text;
          turnTranscript.current.push({ role, text });
        },
        onTurnComplete: () => {
          if (gameOrchestratorRef.current.ensureAgentMove(gameCallbacksRef.current)) return;
          const activeProvider = providerRef.current;
          const activeLlmConfig = llmConfigRef.current;
          const activeOwnerStore = ownerStoreRef.current;
          const transcript = turnTranscript.current;
          if (transcript.length >= 2) {
            conversationMemoryRef.current.indexTurn(transcript);
          }
          if (activeProvider !== "llm" || !activeLlmConfig || !curatorEnabledRef.current) {
            return;
          }
          if (transcript.length < 2) return;
          if (!shouldCurateTranscript(transcript)) return;
          void runCuratorPass(activeLlmConfig, {
            transcript,
            existingRecords: activeOwnerStore.list().map((record) => {
              const weights = activeOwnerStore.weightsFor(record);
              return {
                category: record.category,
                label: record.label,
                value: record.value,
                tier: record.tier,
                confidence: weights.confidence,
                strength: weights.strength,
                contextTags: activeContextTags(record.evidence ?? []),
                conditions: record.conditions,
              };
            }),
          })
            .then((result) => {
              const mergeSessionTags = (tags: string[] | undefined) => {
                if (!tags?.length) return;
                const set = new Set(sessionContextTagsRef.current);
                for (const tag of tags) set.add(tag.trim().toLowerCase());
                sessionContextTagsRef.current = [...set];
              };
              if (result.signals.length > 0) {
                activeOwnerStore.applyCuratorSignals(result.signals);
                for (const signal of result.signals) mergeSessionTags(signal.contextTags);
              }
              for (const split of result.splitProposals) {
                mergeSessionTags(split.conditions.flatMap((c) => c.contextTags));
                const queued = activeOwnerStore.proposeConditionalSplit({
                  category: split.category,
                  label: split.label,
                  defaultValue: split.defaultValue,
                  conditions: split.conditions,
                  reason: split.reason,
                  guarded: split.guarded,
                  tier: split.tier,
                });
                if (queued && curatorAutoAcceptOpenRef.current && !queued.guarded) {
                  activeOwnerStore.acceptProposal(queued.id);
                }
              }
              if (
                result.proposals.length === 0 &&
                result.signals.length === 0 &&
                result.splitProposals.length === 0
              ) {
                return;
              }
              for (const proposal of result.proposals) {
                mergeSessionTags(proposal.contextTags);
                const queued = activeOwnerStore.ingestCuratorProposal(proposal);
                if (queued && curatorAutoAcceptOpenRef.current && !queued.guarded) {
                  activeOwnerStore.acceptProposal(queued.id);
                }
              }
              applyCuratorBriefingTopics(result.proposals);
              // F7-3: owner-stated theme interest → strengthen a manual edge against emerging graph hubs.
              const hubs = emergingInterestThemes(interestConnectionsRef.current, 3);
              for (const proposal of result.proposals) {
                if (proposal.category !== "briefing-topics" && proposal.category !== "briefing") {
                  continue;
                }
                const theme =
                  typeof proposal.value === "string" && proposal.value.trim()
                    ? proposal.value.trim()
                    : proposal.label.trim();
                if (!theme) continue;
                const peer =
                  hubs.find((h) => h.theme !== themeFromTitle(theme))?.theme ?? "profile interests";
                const { connections } = strengthenInterestConnection(
                  interestConnectionsRef.current,
                  { themeA: theme, themeB: peer, kind: "manual" },
                );
                interestConnectionsRef.current = connections;
                setInterestConnections(connections);
                saveInterestConnections(connections);
              }
              setProfileRecordsRef.current(activeOwnerStore.list());
              setProfileProposalsRef.current(activeOwnerStore.listProposals());
              if (activeOwnerStore.listProposals().length > 0) {
                setPanelRef.current("profile");
              }
            })
            .catch((error) => console.error("Curator pass failed:", error));
        },
      }),
    [catalog],
  );

  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  gameCallbacksRef.current = {
    getActiveGame: () => findActiveGameInFeed(chatFeedRef.current),
    commitProps: (surfaceId, moduleId, props) => {
      conversationRef.current.updateSurfaceModuleProps(surfaceId, moduleId, props);
    },
    appendAgentText: (text) => {
      if (isActiveShellGameOnFeed(chatFeedRef.current)) {
        setGameNotice(text);
        return;
      }
      conversationRef.current.appendLocalAgentText(text);
    },
    requestAgentTurn: (prompt) => {
      conversationRef.current.setBusy(true);
      sessionRef.current.sendUserMessage(prompt);
    },
  };

  const { feed, busy, pending } = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.getSnapshot(),
  );

  const activeChatGame = useMemo(() => findActiveGameInFeed(feed), [feed]);
  const activeGameEngine = activeChatGame ? getGameEngine(activeChatGame.embed.moduleId) : null;

  useEffect(() => {
    const surfaceId = activeChatGame?.surface.surfaceId ?? null;
    if (surfaceId && surfaceId !== prevGameSurfaceIdRef.current) {
      setGameModalDismissedId(null);
    }
    prevGameSurfaceIdRef.current = surfaceId;
  }, [activeChatGame?.surface.surfaceId]);

  const activeGameProps = activeChatGame
    ? withModulePropDefaults(activeChatGame.embed.moduleId, activeChatGame.embed.props)
    : null;
  const activeGameEnded = activeGameProps ? isGameEnded(activeGameProps) : false;
  const waitingForAgentMove = Boolean(
    busy &&
      activeGameEngine &&
      activeGameProps &&
      (() => {
        const state = activeGameEngine.fromProps(activeGameProps);
        return (
          activeGameEngine.status(state).phase === "active" &&
          activeGameEngine.turn(state) === "agent"
        );
      })(),
  );
  useEffect(() => {
    if (activeGameEnded || !activeChatGame) setGameNotice(null);
  }, [activeGameEnded, activeChatGame?.surface.surfaceId]);

  const showGameModal = Boolean(
    activeChatGame && gameModalDismissedId !== activeChatGame.surface.surfaceId,
  );

  useLayoutEffect(() => {
    conversation.bindSession(session);
    const prev = prevSessionRef.current;
    prevSessionRef.current = session;
    if (prev && prev !== session) {
      queueMicrotask(() => prev.dispose?.());
    }
  }, [session, conversation]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed, busy]);

  function recordInterestEdge(
    themeA: string,
    themeB: string,
    kind: "tangent" | "return" | "explicit" | "manual",
    pathId?: string,
  ) {
    const { connections } = strengthenInterestConnection(interestConnectionsRef.current, {
      themeA,
      themeB,
      kind,
      pathId,
    });
    interestConnectionsRef.current = connections;
    setInterestConnections(connections);
    saveInterestConnections(connections);
  }

  function dismissDiscoveryPath() {
    if (!activeDiscoveryPathId) return;
    setActiveDiscoveryPathId(null);
    clearActiveDiscoveryPathId();
  }

  function resumeDiscoveryPath(pathId: string) {
    const path = findDiscoveryPath(discoveryPaths, pathId);
    if (!path || path.steps.length === 0) return;
    setActiveDiscoveryPathId(pathId);
    saveActiveDiscoveryPathId(pathId);
  }

  function selectDiscoveryStep(step: DiscoveryPathStep) {
    const pathBefore = findDiscoveryPath(discoveryPaths, activeDiscoveryPathId);
    const leaving = pathBefore?.steps[pathBefore.steps.length - 1];
    if (leaving && leaving.id !== step.id) {
      recordInterestEdge(
        themeFromTitle(leaving.title),
        themeFromTitle(step.title),
        "return",
        pathBefore?.id,
      );
    }
    const truncated = truncateDiscoveryPathToStep(discoveryPaths, activeDiscoveryPathId, step.id);
    if (!truncated) return;
    setDiscoveryPaths(truncated.paths);
    setActiveDiscoveryPathId(truncated.path.id);
    saveDiscoveryPaths(truncated.paths);
    saveActiveDiscoveryPathId(truncated.path.id);
    const payload: LinkIntentPayload = {
      url: step.url,
      title: step.title,
      intent: step.intent,
    };
    const enriched = enrichLinkIntentPayload(payload, truncated.path, truncated.step);
    let message: string;
    try {
      message = buildLinkIntentMessage(enriched);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    turnTranscript.current = [];
    conversationRef.current.appendUser(friendlyLinkIntentLabel(payload));
    conversationRef.current.setBusy(true);
    try {
      sessionRef.current.sendUserMessage(message);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      conversationRef.current.setBusy(false);
    }
  }

  function submitLinkIntent(payload: LinkIntentPayload) {
    const prior = findDiscoveryPath(discoveryPaths, activeDiscoveryPathId);
    const priorTheme = prior?.steps.length
      ? themeFromTitle(prior.steps[prior.steps.length - 1]!.title)
      : prior
        ? themeFromTitle(prior.label)
        : null;
    const nextTheme = themeFromTitle(payload.title);
    const appended = appendDiscoveryStep(discoveryPaths, activeDiscoveryPathId, payload);
    setDiscoveryPaths(appended.paths);
    setActiveDiscoveryPathId(appended.path.id);
    saveDiscoveryPaths(appended.paths);
    saveActiveDiscoveryPathId(appended.path.id);
    if (payload.intent === "explore" && priorTheme) {
      recordInterestEdge(priorTheme, nextTheme, "tangent", appended.path.id);
    } else if (
      payload.intent === "explore" &&
      !priorTheme &&
      nextTheme.split(" ").length >= 2
    ) {
      // Seed first explore hop against its leading token as a coarse theme hub.
      const hub = nextTheme.split(" ")[0]!;
      recordInterestEdge(hub, nextTheme, "tangent", appended.path.id);
    }
    const enriched = enrichLinkIntentPayload(payload, appended.path, appended.step);
    let message: string;
    try {
      message = buildLinkIntentMessage(enriched);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    turnTranscript.current = [];
    conversationRef.current.appendUser(friendlyLinkIntentLabel(payload));
    conversationRef.current.setBusy(true);
    try {
      sessionRef.current.sendUserMessage(message);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      conversationRef.current.setBusy(false);
    }
  }

  function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (
      activeDiscoveryPath &&
      isDiscoveryTopicChange(
        trimmed,
        activeDiscoveryPath.label,
        activeDiscoveryPath.steps.map((step) => step.title),
      )
    ) {
      dismissDiscoveryPath();
    }
    if (provider === "llm" && !llmConfig) {
      conversationRef.current.appendUserAndAgentText(
        trimmed,
        "Live LLM is selected but no API key is configured. Open Settings to add your key.",
      );
      return;
    }
    if (
      activeChatGame &&
      !activeGameEnded &&
      /\b(?:play\s*)?(?:a\s+)?tic[\s-]?tac[\s-]?toe\b|\bplay\s+(?:a\s+)?game\b/i.test(trimmed)
    ) {
      setGameModalDismissedId(null);
      setInput("");
      return;
    }
    turnTranscript.current = [];
    conversationRef.current.appendUser(trimmed);
    setInput("");
    conversationRef.current.setBusy(true);
    try {
      sessionRef.current.sendUserMessage(trimmed);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      conversationRef.current.setBusy(false);
    }
  }

  function applyPathIntersectDecision(decision: "merge" | "keep-separate") {
    const hit = pendingIntersectionRef.current;
    if (!hit) return;
    const nextDismissed = markIntersectionDismissed(
      dismissedIntersections,
      hit.activePathId,
      hit.relatedPathId,
    );
    setDismissedIntersections(nextDismissed);
    pendingIntersectionRef.current = null;
    pathIntersectionContextRef.current = "";

    if (decision === "merge") {
      const merged = mergeDiscoveryPaths(discoveryPaths, hit.activePathId, hit.relatedPathId);
      setDiscoveryPaths(merged);
      saveDiscoveryPaths(merged);
      setActiveDiscoveryPathId(hit.activePathId);
      saveActiveDiscoveryPathId(hit.activePathId);
      recordInterestEdge(
        themeFromTitle(hit.relatedLabel),
        themeFromTitle(activeDiscoveryPath?.label ?? hit.relatedLabel),
        "explicit",
        hit.activePathId,
      );
    }

    const note = buildPathIntersectOwnerMessage(decision, hit);
    turnTranscript.current = [];
    conversationRef.current.appendUser(
      decision === "merge"
        ? `Merge with: ${hit.relatedLabel}`
        : `Keep separate from: ${hit.relatedLabel}`,
    );
    conversationRef.current.setBusy(true);
    try {
      sessionRef.current.sendUserMessage(note);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
      conversationRef.current.setBusy(false);
    }
  }

  function handleUiEvent(event: UiEvent) {
    if (recordUiPreferenceFeedback(ownerStore, event) > 0) {
      setProfileRecords(ownerStore.list());
    }
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : undefined;

    if (
      event.name === "selected" &&
      typeof payload?.optionId === "string" &&
      pendingIntersectionRef.current &&
      (payload.optionId === "merge" || payload.optionId === "keep-separate")
    ) {
      applyPathIntersectDecision(payload.optionId);
      return;
    }

    if (activeChatGame && activeGameEngine) {
      const props = withModulePropDefaults(activeChatGame.embed.moduleId, activeChatGame.embed.props);
      const result = gameOrchestratorRef.current.handleOwnerUiEvent(
        event.name,
        payload,
        activeChatGame,
        props,
        gameCallbacksRef.current,
      );
      if (result.handled) {
        if (result.reopenModal) setGameModalDismissedId(null);
        return;
      }
    }

    if (
      !activeChatGame &&
      bridgeChatModuleEvent(event.name, payload)
    ) {
      setPanel("comms");
      if (commsContacts[0] && !commsFocusId) setCommsFocusId(commsContacts[0].id);
      return;
    }
    conversationRef.current.setBusy(true);
    sessionRef.current.sendUiEvent(event);
  }

  async function decide(decision: "approved" | "declined") {
    if (!pending) return;
    const entry = await attestationLog.append({
      surfaceId: pending.surfaceId,
      action: pending.action,
      decision,
    });
    conversationMemoryRef.current.indexCorrection(
      `${pending.action.title} (${decision}): ${JSON.stringify(pending.action.terms)}`,
    );
    setAttestations([...attestationLog.list()]);
    const { dataRequest } = pending;
    if (decision === "approved") {
      const calendarUrl = calendarAddUrlFromAction(pending.action);
      if (calendarUrl) {
        window.open(calendarUrl, "_blank", "noopener,noreferrer");
        if (IS_DEMO_MODE) setDemoCalendarAdded(true);
      }
    }
    conversationRef.current.clearPending();
    conversationRef.current.setBusy(true);
    if (dataRequest) {
      const records =
        decision === "approved"
          ? ownerStore.guardedRecords(dataRequest.categories).map((record) => ({
              category: record.category,
              label: record.label,
              value: record.value,
            }))
          : [];
      sessionRef.current.sendDataDisclosure?.(dataRequest.requestId, decision, records);
    } else {
      sessionRef.current.sendActionDecision(entry.action.id, decision);
    }
  }

  const requestCommsConfirmation = useCallback(
    (action: ConsequentialAction) =>
      new Promise<
        | { decision: "declined" }
        | { decision: "approved"; attestationRef: string; approvalRef: string }
      >((resolve) => {
        setCommsPending({ action, resolve });
      }),
    [],
  );

  async function decideChrome(decision: "approved" | "declined") {
    const activeAction = commsPending?.action ?? pending?.action;
    let approvalRef = "";
    if (decision === "approved" && activeAction) {
      setCustodyError(null);
      try {
        const config = vaultUnlocked
          ? await loadCommsAgentConfigSecure()
          : loadCommsAgentConfig();
        const custody = await requireCustodyApproval(activeAction, config);
        approvalRef = custody.approvalRef;
      } catch (error) {
        setCustodyError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    if (commsPending) {
      const pendingComms = commsPending;
      const entry = await attestationLog.append({
        surfaceId: "comms",
        action: pendingComms.action,
        decision,
      });
      conversationMemoryRef.current.indexCorrection(
        `${pendingComms.action.title} (${decision}): ${JSON.stringify(pendingComms.action.terms)}`,
      );
      setAttestations([...attestationLog.list()]);
      setCommsPending(null);
      if (decision === "approved") {
        pendingComms.resolve({
          decision: "approved",
          attestationRef: `attestation:${entry.seq}:${entry.hash.slice(0, 16)}`,
          approvalRef,
        });
      } else {
        pendingComms.resolve({ decision: "declined" });
      }
      return;
    }
    await decide(decision);
  }

  const chromePending =
    pending ??
    (commsPending
      ? { action: commsPending.action, surfaceId: "comms", dataRequest: undefined }
      : null);

  function switchProvider(next: Provider) {
    if (next === "llm" && !ALLOW_BROWSER_LLM) return;
    if (next === "llm" && !isLlmConnectionReady(llmConnection, secretStore)) {
      setSettingsIntent("llm");
      setSettingsOpen(true);
      return;
    }
    setSettingsIntent(null);
    try {
      saveStringToStorage(PROVIDER_KEY, next);
    } catch {
      // Best-effort persistence.
    }
    if (next === "llm") {
      const accepted = ownerStore.acceptOpenProposals();
      if (accepted > 0) {
        setProfileRecords(ownerStore.list());
        setProfileProposals(ownerStore.listProposals());
      }
    }
    setProvider(next);
    conversationRef.current.reset();
  }

  function handleDemoReady() {
    markFirstRunDone();
    setDemoReady(true);
    setDemoBootstrapError(null);
    applyDemoPersona("alice");
    setPanel("none");
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsIntent(null);
  }

  const demoLlmReady = isLlmConnectionReady(llmConnection, secretStore);
  const showMainFeed =
    (IS_DEMO_MODE && demoReady && panel !== "log") || (!IS_DEMO_MODE && panel === "none");
  const showMainComposer = showMainFeed;

  function navigatePanel(next: SidePanel): void {
    setPanel(next);
  }

  const loadedGames = useMemo(
    () =>
      listGameModuleIds()
        .filter((moduleId) => catalog.isModuleInstalled(moduleId))
        .map((moduleId) => ({ moduleId, label: gameModuleLabel(moduleId) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [catalog],
  );

  async function startGameFromMenu(moduleId: string) {
    if (!getGameEngine(moduleId) || !catalog.isModuleInstalled(moduleId)) return;
    navigatePanel("none");
    setGameModalDismissedId(null);
    ownerStartGameRef.current = true;
    try {
      await conversationRef.current.showComposition(buildGameStartComposition(moduleId));
      gameOrchestratorRef.current.resetTurnState();
      gameOrchestratorRef.current.ensureAgentMove(gameCallbacksRef.current);
    } finally {
      ownerStartGameRef.current = false;
    }
  }

  const profileNavBadge = profileProposals.length
    ? { count: profileProposals.length, tone: "warn" as const }
    : profileRecords.length
      ? { count: profileRecords.length, tone: "default" as const }
      : null;

  function saveDemoLlmKey(apiKey: string) {
    const connection: LlmConnectionConfig = llmConnection ?? {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      secretRef: DEFAULT_LLM_SECRET_REF,
    };
    secretStore.set(connection.secretRef, apiKey);
    persistLlmConnection(connection);
    setLlmConnection(connection);
  }

  async function saveDemoWebcalFeed(url: string) {
    const config = loadCommsAgentConfig();
    const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
    await client.addWebcalFeed(url);
    await refreshDemoWebcalState();
  }

  function sendDemoScheduleMessage(text: string) {
    setDemoScheduleSent(true);
    submitMessage(text);
  }

  return (
    <>
      <AtomShell
        section={panel}
        onNavigate={navigatePanel}
        onOpenSettings={() => {
          setSettingsIntent(null);
          setSettingsOpen(true);
        }}
        banner={
          showMainFeed && activeDiscoveryPath && activeDiscoveryPath.steps.length > 0 ? (
            <DiscoveryBreadcrumb
              path={activeDiscoveryPath}
              history={discoveryPaths}
              onStepSelect={selectDiscoveryStep}
              onDismiss={dismissDiscoveryPath}
              onResumePath={resumeDiscoveryPath}
            />
          ) : undefined
        }
        headerActions={
          usesSupabaseHostedAuth() ? (
            <button
              type="button"
              className="btn btn-ghost atom-app-logout hide-mobile"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          ) : undefined
        }
        games={loadedGames}
        onStartGame={(moduleId) => void startGameFromMenu(moduleId)}
        badges={{
          ...(commsUnreadCount > 0 ? { comms: { count: commsUnreadCount } } : {}),
          ...(profileNavBadge ? { profile: profileNavBadge } : {}),
          ...(attestations.length > 0 ? { log: { count: attestations.length } } : {}),
        }}
        status={
          <>
            {registryError ? (
              <span className="atom-app-status" title={registryError}>
                Registry error
              </span>
            ) : null}
            {isVaultInitialized() ? (
              <span className="atom-app-status">
                <span
                  className={`atom-status-dot${vaultUnlocked ? " atom-status-dot--active" : ""}`}
                  aria-hidden="true"
                />
                {vaultUnlocked ? "Vault unlocked" : "Vault locked"}
              </span>
            ) : null}
            {showModulesToggle ? (
              <button
                type="button"
                className="btn btn-ghost"
                aria-pressed={modulesEnabled}
                onClick={() => setModulesEnabled((current) => !current)}
              >
                Modules {modulesEnabled ? "on" : "off"}
              </button>
            ) : null}
          </>
        }
        composer={
          showMainComposer ? (
            <ShellComposer
              value={input}
              busy={busy}
              onChange={setInput}
              onSubmit={submitMessage}
            />
          ) : undefined
        }
      >
        {IS_DEMO_MODE && demoReady && panel !== "log" ? (
          <PersonalDemoWalkthrough
            agentReady={demoReady}
            llmReady={demoLlmReady}
            webcalReady={demoWebcalReady}
            calendarEvents={demoCalendarEvents}
            scheduleSent={demoScheduleSent}
            calendarAdded={demoCalendarAdded}
            waitingForConfirm={Boolean(pending && !commsPending)}
            onSaveLlm={saveDemoLlmKey}
            onSaveWebcal={saveDemoWebcalFeed}
            onSendDemoMessage={sendDemoScheduleMessage}
          />
        ) : null}

        {showMainFeed ? (
        <main className="shell-feed" ref={feedRef}>
          {feed.length === 0 ? (
            <div className="shell-empty">
              <h1>Direct your intent.</h1>
              <p>
                The agent composes; the shell renders from its trusted catalog. Actions of
                consequence only ever happen in shell-owned chrome.
              </p>
              <div className="shell-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => submitMessage(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              {provider === "llm" ? (
                <p className="shell-empty-note">
                  Live agent: composes from the catalog. Connect WebCal in Settings → Connectors for
                  calendar context.
                </p>
              ) : null}
              {provider === "ag-ui" && !agUiConfig.url.trim() ? (
                <p className="shell-empty-note">
                  {IS_PRODUCTION_HOST
                    ? "Set your chat agent URL in Settings to start a conversation."
                    : "Connect to a server-side chat agent using the URL in Settings."}
                </p>
              ) : null}
            </div>
          ) : (
            feed.map((item) => {
              if (item.kind === "user") {
                return (
                  <div key={item.id} className="feed-user">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === "agent-text") {
                return (
                  <FeedAgentText key={item.id} text={item.text} onLinkIntent={submitLinkIntent} />
                );
              }
              return (
                <ChatFeedSurface
                  key={item.id}
                  surface={item.surface}
                  catalog={catalog}
                  registry={registry}
                  busyEvents={webcalBusyEvents}
                  onEvent={handleUiEvent}
                  onLinkIntent={submitLinkIntent}
                  onResumeGame={() => setGameModalDismissedId(null)}
                />
              );
            })
          )}
          {busy ? <div className="feed-busy">agent working…</div> : null}
        </main>
        ) : null}

        {!IS_DEMO_MODE && panel === "comms" ? (
          <div className="shell-panel-view shell-panel-view--inset">
          <CommsPanel
            contacts={commsContacts}
            ownerRecords={profileRecords}
            ownerStore={ownerStore}
            focusContactId={commsFocusId}
            vaultUnlocked={vaultUnlocked}
            agentConnectionReady={agentConnectionReady}
            onAgentAuthFailure={handleAgentAuthFailure}
            onRequestReconnect={() => {
              resetFirstRunDone();
              clearCommsAgentConfig();
              navigate("/app/?auth=login", true);
            }}
            onContactsChanged={() => {
              setCommsFocusId(null);
              setCommsContacts(loadContacts(ownerStore.list()));
            }}
            onProfileChanged={() => {
              setProfileRecords(ownerStore.list());
              setCommsContacts(loadContacts(ownerStore.list()));
            }}
            onRequestConfirmation={requestCommsConfirmation}
            attestationEntries={attestations}
            catalog={catalog}
            registry={registry}
            modulesEnabled={modulesActive}
          />
          </div>
        ) : null}

        {!IS_DEMO_MODE && panel === "discover" ? (
          <div className="shell-panel-view shell-panel-view--inset">
          <DiscoverPanel
            contacts={commsContacts}
            vaultUnlocked={vaultUnlocked}
            agentConnectionReady={agentConnectionReady}
            onAgentAuthFailure={handleAgentAuthFailure}
            onRequestReconnect={() => {
              resetFirstRunDone();
              clearCommsAgentConfig();
              navigate("/app/?auth=login", true);
            }}
            onContactsChange={setCommsContacts}
            onJoinedRoom={(roomId) => {
              setRoomsFocusId(roomId);
              setPanel("rooms");
            }}
            onDmStarted={(contactId) => {
              setCommsFocusId(contactId);
              setPanel("comms");
            }}
          />
          </div>
        ) : null}

        {!IS_DEMO_MODE && panel === "rooms" ? (
          <div className="shell-panel-view shell-panel-view--inset">
          <RoomsPanel
            initialRoomId={roomsFocusId}
            contacts={commsContacts}
            vaultUnlocked={vaultUnlocked}
            agentConnectionReady={agentConnectionReady}
            onAgentAuthFailure={handleAgentAuthFailure}
            onRequestReconnect={() => {
              resetFirstRunDone();
              clearCommsAgentConfig();
              navigate("/app/?auth=login", true);
            }}
            onContactsChange={setCommsContacts}
            onOpenDiscover={() => setPanel("discover")}
            onActivity={() => {
              if (roomsFocusId) setRoomsFocusId(null);
            }}
          />
          </div>
        ) : null}

        {!IS_DEMO_MODE && panel === "profile" ? (
          <div className="shell-panel-view">
          <ProfilePanel
            store={ownerStore}
            records={profileRecords}
            proposals={profileProposals}
            showBusinessSections={!IS_PRODUCTION_HOST}
            onChanged={() => {
              setProfileRecords(ownerStore.list());
              setProfileProposals(ownerStore.listProposals());
            }}
          />
          </div>
        ) : null}

        {panel === "log" ? (
          <div className="shell-panel-view">
          <div className="panel-view">
          <div className="panel-body panel-body-scroll">
            <div className="panel-content-wide">
            <p className="panel-section-note">
              Append-only, hash-chained record of every consequential decision and the exact terms
              displayed when you made it.
            </p>
            {attestations.length === 0 ? (
              <p className="panel-empty">No decisions recorded yet.</p>
            ) : (
              <div className="attestation-list">
              {attestations.map((entry) => (
                <div key={entry.seq} className={`attestation attestation-${entry.decision}`}>
                  <div className="attestation-head">
                    <span>#{entry.seq}</span>
                    <span>{entry.decision}</span>
                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="attestation-title">{entry.action.title}</div>
                  <dl className="attestation-terms">
                    {Object.entries(entry.displayedTerms).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="attestation-hash">{entry.hash.slice(0, 16)}…</div>
                </div>
              ))}
              </div>
            )}
            </div>
          </div>
          </div>
          </div>
        ) : null}
      </AtomShell>

      {chromePending ? (
        <ConfirmationChrome
          action={chromePending.action}
          isDemoMode={IS_DEMO_MODE}
          banner={
            chromePending.dataRequest
              ? "Shell-verified request · guarded data disclosure"
              : chromePending.surfaceId === "comms"
                ? "Shell-verified request · coordination action"
                : "Shell-verified request · terms restated from the data object"
          }
          footnote={
            IS_DEMO_MODE
              ? "Demo mode — this approval is logged locally, then Google Calendar opens in a new tab."
              : calendarAddUrlFromAction(chromePending.action)
                ? "Approve to open Google Calendar with these fields prefilled (no write access from Atom). This decision is recorded in your attestation log."
                : "Approving requires your passkey (biometric or PIN). This decision is recorded in your attestation log."
          }
          error={custodyError}
          onDecline={() => void decideChrome("declined")}
          onApprove={() => void decideChrome("approved")}
        />
      ) : null}

      {showGameModal && activeChatGame ? (
        <GameModal
          surface={activeChatGame.surface}
          moduleId={activeChatGame.embed.moduleId}
          nodeId={activeChatGame.embed.nodeId}
          props={activeGameProps ?? activeChatGame.embed.props}
          catalog={catalog}
          registry={registry}
          agentBusy={waitingForAgentMove}
          notice={gameNotice}
          onClose={() => {
            setGameModalDismissedId(activeChatGame.surface.surfaceId);
            setGameNotice(null);
          }}
          onEvent={handleUiEvent}
        />
      ) : null}

      {IS_DEMO_MODE && !demoReady ? (
        <DemoBootstrap
          onReady={handleDemoReady}
          onError={(message) => setDemoBootstrapError(message)}
        />
      ) : null}

      {demoBootstrapError && IS_DEMO_MODE && !demoReady ? (
        <p className="demo-bootstrap-error">{demoBootstrapError}</p>
      ) : null}

      {!IS_DEMO_MODE && agentConnectionReady && !vaultUnlocked ? (
        <VaultUnlockGate
          onUnlocked={() => {
            void refreshCommsConfigCache().then(() => {
              setVaultUnlocked(true);
              void refreshWebcalState();
            });
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          llmConnectionInitial={llmConnection}
          savedLlmKeyHint={savedLlmKeyHint}
          stripePaymentInitial={stripePayment}
          savedStripeSecretHint={savedStripeSecretHint}
          agUiInitial={agUiConfig}
          registryInitial={registryUrl}
          trustInitial={registryTrust}
          revokedModules={revokedModules}
          curatorInitial={curatorEnabled}
          curatorAutoAcceptInitial={curatorAutoAcceptOpen}
          productionLocked={IS_PRODUCTION_HOST}
          vaultUnlocked={vaultUnlocked}
          intent={settingsIntent}
          chatProvider={provider}
          chatProviderSummary={chatProviderSummary}
          allowBrowserLlm={ALLOW_BROWSER_LLM}
          onWebcalFeedsChanged={() => void refreshWebcalState()}
          onRssFeedsChanged={() => void refreshRssState()}
          agentConnectionReady={agentConnectionReady}
          resolveLlmApiKey={() =>
            llmConnection ? secretStore.get(llmConnection.secretRef) ?? null : null
          }
          onSwitchChatProvider={switchProvider}
          onClose={closeSettings}
          onLogout={usesSupabaseHostedAuth() ? () => void handleLogout() : undefined}
          onSaveLlm={(connection, apiKey) => {
            if (apiKey !== undefined) {
              secretStore.set(connection.secretRef, apiKey);
            }
            if (IS_PRODUCTION_HOST) {
              persistLlmConnectionToSession(connection);
            } else {
              persistLlmConnection(connection);
            }
            setLlmConnection(connection);
            setSettingsIntent(null);
            setSettingsOpen(false);
            saveStringToStorage(PROVIDER_KEY, "llm");
            setProvider("llm");
            conversationRef.current.reset();
          }}
          onSaveAgUi={(config) => {
            const err = validateProductionAgUiUrl(config.url);
            if (err) return;
            saveJsonToStorage(AGUI_CONFIG_KEY, config);
            setAgUiConfig(config);
            setSettingsIntent(null);
            setSettingsOpen(false);
            saveStringToStorage(PROVIDER_KEY, "ag-ui");
            setProvider("ag-ui");
            conversationRef.current.reset();
          }}
          onSaveRegistry={(url, trust) => {
            if (IS_PRODUCTION_HOST) return;
            saveStringToStorage(REGISTRY_URL_KEY, url);
            saveJsonToStorage(REGISTRY_TRUST_KEY, trust);
            registry.uninstallAll(catalog);
            registry.clearCache();
            setRegistryUrl(url);
            setRegistryTrust(trust);
            setRegistryError(null);
            void registry.refreshRevocations().then(() => {
              setRevokedModules(registry.listRevoked());
            });
          }}
          onSaveCurator={(enabled, autoAcceptOpen) => {
            saveStringToStorage(CURATOR_ENABLED_KEY, String(enabled));
            saveStringToStorage(CURATOR_AUTO_ACCEPT_KEY, String(autoAcceptOpen));
            setCuratorEnabled(enabled);
            setCuratorAutoAcceptOpen(autoAcceptOpen);
            if (autoAcceptOpen) {
              const accepted = ownerStore.acceptOpenProposals();
              if (accepted > 0) {
                setProfileRecords(ownerStore.list());
                setProfileProposals(ownerStore.listProposals());
              }
            }
          }}
          onSaveStripePayment={(connection, secretKey) => {
            if (secretKey !== undefined) {
              secretStore.set(connection.secretRef, secretKey);
            }
            setPaymentConnections(upsertPaymentConnection(connection));
          }}
          catalog={catalog}
          registry={registry}
          modulesActive={modulesActive}
        />
      ) : null}
    </>
  );
}

function SettingsDialog({
  llmConnectionInitial,
  savedLlmKeyHint,
  stripePaymentInitial,
  savedStripeSecretHint,
  agUiInitial,
  registryInitial,
  trustInitial,
  revokedModules,
  curatorInitial,
  curatorAutoAcceptInitial,
  productionLocked,
  vaultUnlocked,
  intent,
  chatProvider,
  chatProviderSummary,
  allowBrowserLlm,
  onWebcalFeedsChanged,
  onRssFeedsChanged,
  agentConnectionReady,
  resolveLlmApiKey,
  onSwitchChatProvider,
  onClose,
  onLogout,
  onSaveLlm,
  onSaveStripePayment,
  onSaveAgUi,
  onSaveRegistry,
  onSaveCurator,
  catalog,
  registry,
  modulesActive,
}: {
  llmConnectionInitial: LlmConnectionConfig | null;
  savedLlmKeyHint: string | null;
  stripePaymentInitial: PaymentConnectionConfig | null;
  savedStripeSecretHint: string | null;
  agUiInitial: AgUiAgentConfig;
  registryInitial: string;
  trustInitial: RegistryTrustPolicy;
  revokedModules: readonly RegistryRevocation[];
  curatorInitial: boolean;
  curatorAutoAcceptInitial: boolean;
  productionLocked: boolean;
  vaultUnlocked: boolean;
  intent: Provider | null;
  chatProvider: Provider;
  chatProviderSummary: string;
  allowBrowserLlm: boolean;
  onWebcalFeedsChanged?: () => void;
  onRssFeedsChanged?: () => void;
  agentConnectionReady: boolean;
  resolveLlmApiKey: () => string | null;
  onSwitchChatProvider: (provider: Provider) => void;
  onClose: () => void;
  onLogout?: () => void;
  onSaveLlm: (connection: LlmConnectionConfig, apiKey?: string) => void;
  onSaveStripePayment: (connection: PaymentConnectionConfig, secretKey?: string) => void;
  onSaveAgUi: (config: AgUiAgentConfig) => void;
  onSaveRegistry: (url: string, trust: RegistryTrustPolicy) => void;
  onSaveCurator: (enabled: boolean, autoAcceptOpen: boolean) => void;
  catalog: Catalog;
  registry: ModuleRegistry;
  modulesActive: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(
    llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(llmConnectionInitial?.model ?? "");
  const modelRef = useRef(model);
  modelRef.current = model;
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilityProfile | null>(() => {
    const stored = llmConnectionInitial?.capabilities;
    if (stored && typeof stored === "object") {
      return normalizeModelCapabilityProfile(stored as Partial<ModelCapabilityProfile>, {
        baseUrl: llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1",
        model: llmConnectionInitial?.model ?? "",
      });
    }
    return null;
  });
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  /** null = no key yet; true = provider returned models; false = use text input fallback */
  const [modelsFromApi, setModelsFromApi] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [changingKey, setChangingKey] = useState(!savedLlmKeyHint);
  const [agUiUrl, setAgUiUrl] = useState(agUiInitial.url);
  const [registryIndexUrl, setRegistryIndexUrl] = useState(registryInitial);
  const [requireIntegrity, setRequireIntegrity] = useState(trustInitial.requireIntegrity !== false);
  const [requireSignature, setRequireSignature] = useState(trustInitial.requireSignature === true);
  const [blockedIdsText, setBlockedIdsText] = useState(
    (trustInitial.blockedIds ?? []).join("\n"),
  );
  const [curatorOn, setCuratorOn] = useState(curatorInitial);
  const [curatorAutoAcceptOn, setCuratorAutoAcceptOn] = useState(curatorAutoAcceptInitial);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [changingStripeSecret, setChangingStripeSecret] = useState(!savedStripeSecretHint);
  const [stripePublishableKey, setStripePublishableKey] = useState(
    stripePaymentInitial?.publishableKey ?? "",
  );
  const [stripeProductId, setStripeProductId] = useState(stripePaymentInitial?.productId ?? "");
  const hasSavedKey = Boolean(savedLlmKeyHint) && !changingKey;
  const hasApiKey = hasSavedKey || Boolean(apiKey.trim());
  const llmValid = Boolean(baseUrl.trim() && model.trim() && hasApiKey);
  const hasSavedStripeSecret = Boolean(savedStripeSecretHint) && !changingStripeSecret;
  const stripePaymentValid =
    (hasSavedStripeSecret || Boolean(stripeSecretKey.trim())) &&
    Boolean(stripePublishableKey.trim());
  const agUiError = validateProductionAgUiUrl(agUiUrl);
  const agUiValid = !agUiError;
  const isHostedAgent =
    productionLocked && MANAGED_HOSTING && loadOwnerAgentKind(loadCommsAgentConfig()) === "hosted";
  const [hostedLlmKey, setHostedLlmKey] = useState("");
  const [hostedLlmBusy, setHostedLlmBusy] = useState(false);
  const [hostedLlmNote, setHostedLlmNote] = useState<string | null>(null);
  const [hostedLlmError, setHostedLlmError] = useState<string | null>(null);
  const [moduleCatalogNote, setModuleCatalogNote] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    | "agent"
    | "briefing"
    | "security"
    | "connectors"
    | "appearance"
    | "modules"
    | "payments"
    | "developer"
    | "donations"
  >("agent");

  const navItems = useMemo(() => {
    const items: Array<{
      id: typeof activeSection;
      label: string;
      hint: string;
    }> = [
      { id: "agent", label: "Agent", hint: "Connection and API keys" },
      { id: "briefing", label: "Briefing", hint: "Session-open roundup" },
      { id: "security", label: "Security", hint: "Vault and passkey" },
      { id: "connectors", label: "Connectors", hint: "Calendar and integrations" },
      { id: "appearance", label: "Appearance", hint: "Theme and skin" },
      { id: "modules", label: "Modules", hint: "Catalog and registry" },
      { id: "donations", label: "Donations", hint: "Support Atom development" },
    ];
    if (!productionLocked) {
      items.splice(4, 0, { id: "payments", label: "Payments", hint: "Stripe and commerce" });
      items.push({ id: "developer", label: "Developer", hint: "AG-UI and registry URL" });
    }
    return items;
  }, [productionLocked]);

  async function saveHostedLlmKey() {
    const key = hostedLlmKey.trim();
    if (!key) {
      setHostedLlmError("Enter your LLM API key.");
      return;
    }
    setHostedLlmBusy(true);
    setHostedLlmError(null);
    setHostedLlmNote(null);
    try {
      await updateHostedLlmApiKey(key);
      setHostedLlmKey("");
      setHostedLlmNote("LLM API key updated. Your agent will restart briefly — try chat again in a moment.");
    } catch (error) {
      setHostedLlmError(error instanceof Error ? error.message : String(error));
    } finally {
      setHostedLlmBusy(false);
    }
  }

  function saveLlmAndEnable() {
    onSaveCurator(curatorOn, curatorAutoAcceptOn);
    const connection: LlmConnectionConfig = {
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      secretRef: llmConnectionInitial?.secretRef ?? DEFAULT_LLM_SECRET_REF,
      capabilities:
        modelCapabilities ??
        inferModelCapabilities(baseUrl.trim(), model.trim()),
    };
    onSaveLlm(connection, hasSavedKey ? undefined : apiKey.trim());
  }

  const discoverCapabilities = useCallback(async () => {
    const key = hasSavedKey ? resolveLlmApiKey() : apiKey.trim();
    if (!baseUrl.trim() || !model.trim() || !key) {
      setModelCapabilities(null);
      return;
    }
    setCapabilitiesLoading(true);
    try {
      const profile = await discoverModelCapabilities({
        baseUrl: baseUrl.trim(),
        apiKey: key,
        model: model.trim(),
        probe: true,
      });
      setModelCapabilities(profile);
    } catch {
      setModelCapabilities(inferModelCapabilities(baseUrl.trim(), model.trim()));
    } finally {
      setCapabilitiesLoading(false);
    }
  }, [apiKey, baseUrl, hasSavedKey, model, resolveLlmApiKey]);

  useEffect(() => {
    if (!allowBrowserLlm) return;
    const timer = setTimeout(() => void discoverCapabilities(), 400);
    return () => clearTimeout(timer);
  }, [allowBrowserLlm, discoverCapabilities]);

  const loadModelOptions = useCallback(async () => {
    const key = hasSavedKey ? resolveLlmApiKey() : apiKey.trim();
    if (!baseUrl.trim() || !key) {
      setModelOptions([]);
      setModelsFromApi(null);
      return;
    }
    setModelOptionsLoading(true);
    try {
      const ids = await listOpenAiCompatibleModels(baseUrl, key);
      const persisted =
        modelRef.current.trim() || llmConnectionInitial?.model?.trim() || "";
      const merged =
        persisted && !ids.includes(persisted) ? [persisted, ...ids] : ids;
      setModelOptions(merged);
      setModelsFromApi(true);
    } catch {
      setModelOptions([]);
      setModelsFromApi(false);
    } finally {
      setModelOptionsLoading(false);
    }
  }, [apiKey, baseUrl, hasSavedKey, llmConnectionInitial?.model, resolveLlmApiKey]);

  useEffect(() => {
    if (!allowBrowserLlm) return;
    const delay = hasSavedKey || !apiKey.trim() ? 0 : 500;
    const timer = setTimeout(() => void loadModelOptions(), delay);
    return () => clearTimeout(timer);
  }, [allowBrowserLlm, loadModelOptions, apiKey, hasSavedKey, baseUrl]);

  function saveStripePayment() {
    const connection: PaymentConnectionConfig = {
      provider: "stripe",
      secretRef: stripePaymentInitial?.secretRef ?? DEFAULT_STRIPE_PAYMENT_REF,
      label: "Stripe",
      publishableKey: stripePublishableKey.trim() || undefined,
      productId: stripeProductId.trim() || undefined,
    };
    onSaveStripePayment(connection, hasSavedStripeSecret ? undefined : stripeSecretKey.trim());
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (intent === "llm") setActiveSection("agent");
  }, [intent]);

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0]!;

  function renderAgentPanel() {
    return (
      <>
        {!productionLocked ? (
          <>
            <p className="settings-note">
              <strong>Chat</strong> composes the main feed (Live LLM or AG-UI).{" "}
              <strong>Messages</strong> is your agent talking to other agents (A2A) — configured at
              signup or reconnect, independent of Chat provider.
            </p>
            <fieldset className="atom-field">
              <legend className="atom-field-label">Chat provider</legend>
              <div className="shell-segmented settings-chat-provider" role="group">
                {allowBrowserLlm ? (
                  <button
                    type="button"
                    className={chatProvider === "llm" || intent === "llm" ? "is-active" : ""}
                    onClick={() => onSwitchChatProvider("llm")}
                  >
                    Live LLM
                  </button>
                ) : null}
                <button
                  type="button"
                  className={chatProvider === "ag-ui" || intent === "ag-ui" ? "is-active" : ""}
                  onClick={() => onSwitchChatProvider("ag-ui")}
                >
                  Agent (AG-UI)
                </button>
              </div>
              <p className="atom-note">Active: {chatProviderSummary}</p>
            </fieldset>
          </>
        ) : null}
        {intent === "llm" && !productionLocked ? (
          <p className="settings-intent-note">
            Enter your model endpoint and API key, then click <strong>Enable Live LLM</strong> below.
          </p>
        ) : null}
        {productionLocked ? (
          <>
            <p className="settings-note">
              {isHostedAgent
                ? "Chat runs on your hosted agent server. Update your LLM API key below if chat fails or you need to rotate credentials."
                : "On this site, chat runs through a server-side agent — your API keys never enter the browser."}
            </p>
            {isHostedAgent ? (
              <>
                <label className="atom-field">
                  <FieldLabelWithHint label="LLM API key" hint={<LlmApiKeyHintContent />} />
                  <input
                    type="password"
                    autoComplete="off"
                    value={hostedLlmKey}
                    onChange={(e) => setHostedLlmKey(e.target.value)}
                    placeholder="sk-…"
                  />
                </label>
                {hostedLlmError ? (
                  <p className="settings-note settings-error">{hostedLlmError}</p>
                ) : null}
                {hostedLlmNote ? <p className="settings-note">{hostedLlmNote}</p> : null}
                <div className="chrome-actions settings-section-actions">
                  <button
                    type="button"
                    className="chrome-approve"
                    disabled={hostedLlmBusy || !hostedLlmKey.trim()}
                    onClick={() => void saveHostedLlmKey()}
                  >
                    {hostedLlmBusy ? "Updating…" : "Update LLM key"}
                  </button>
                </div>
              </>
            ) : null}
            <details className="settings-advanced">
              <summary>Advanced connection</summary>
              <div className="settings-advanced-body">
                <label className="atom-field">
                  <span className="atom-field-label">Chat agent URL</span>
                  <input
                    value={agUiUrl}
                    onChange={(e) => setAgUiUrl(e.target.value)}
                    placeholder="https://your-agent.example.com/agent"
                  />
                </label>
                {agUiError ? <p className="settings-note settings-error">{agUiError}</p> : null}
                <div className="chrome-actions settings-section-actions">
                  <button
                    className="chrome-approve"
                    disabled={!agUiValid}
                    onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
                  >
                    Save chat agent URL
                  </button>
                </div>
              </div>
            </details>
          </>
        ) : (
          <>
            <p className="settings-note">
              OpenAI-compatible chat endpoint. Keys are stored in memory for this session only (local
              dev). For production embedders, use AG-UI or inject a host SecretStore.
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Endpoint base URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
            {hasSavedKey ? (
              <div className="settings-saved-key">
                <span className="settings-saved-key-label">API key</span>
                <span className="settings-saved-key-value">Using saved key ({savedLlmKeyHint})</span>
                <button
                  type="button"
                  className="settings-saved-key-change"
                  onClick={() => {
                    setChangingKey(true);
                    setApiKey("");
                    setModelOptions([]);
                    setModelsFromApi(null);
                  }}
                >
                  Change key
                </button>
              </div>
            ) : (
              <label className="atom-field">
                <span className="atom-field-label">API key</span>
                <input
                  type="password"
                  value={apiKey}
                  placeholder={savedLlmKeyHint ? "Enter new API key" : undefined}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
            )}
            <label className="atom-field">
              <span className="atom-field-label">Model</span>
              {!hasApiKey ? (
                <p className="settings-note">Please add your API Key</p>
              ) : modelOptionsLoading ? (
                <p className="settings-note">Loading models…</p>
              ) : modelsFromApi && modelOptions.length > 0 ? (
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  {!model.trim() ? (
                    <option value="" disabled>
                      Please select a model
                    </option>
                  ) : null}
                  {modelOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={model}
                  placeholder="e.g. gpt-4o-mini"
                  onChange={(e) => setModel(e.target.value)}
                />
              )}
              {hasApiKey && !modelOptionsLoading && modelsFromApi && !model.trim() ? (
                <p className="settings-note">Please select a model</p>
              ) : null}
              {hasApiKey && model.trim() ? (
                capabilitiesLoading ? (
                  <p className="settings-note">Discovering model tools…</p>
                ) : modelCapabilities ? (
                  <p className="settings-note">
                    Model family: {modelCapabilities.modelFamily}. Provider tools:{" "}
                    {formatNativeToolsLabel(modelCapabilities)}
                    {modelCapabilities.source === "provider-metadata" ? " (from provider metadata)" : ""}
                    {modelCapabilities.source === "probe" ? " (from probe)" : ""}.
                    {modelCapabilities.chatComposeNote
                      ? ` ${modelCapabilities.chatComposeNote}`
                      : " Atom adds connector invoke (calendar, RSS, news search, bookmarks) when your agent is connected."}
                  </p>
                ) : null
              ) : null}
            </label>
            {!intent ? (
              <div className="chrome-actions settings-section-actions">
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={!llmValid}
                  onClick={saveLlmAndEnable}
                >
                  Use live LLM
                </button>
              </div>
            ) : null}
            <section className="settings-section" aria-labelledby="settings-memory-heading">
              <h3 id="settings-memory-heading">Model memory preferences</h3>
              <p className="settings-note">
                After each chat turn, Atom can extract durable preferences into your Profile — separate
                from the model you chat with.
              </p>
              <ul className="settings-checkbox-list">
                <li>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={curatorOn}
                      onChange={(e) => setCuratorOn(e.target.checked)}
                    />
                    <span className="settings-checkbox-text">
                      Remember preferences from chat (curator)
                    </span>
                  </label>
                </li>
                <li>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={curatorAutoAcceptOn}
                      disabled={!curatorOn}
                      onChange={(e) => setCuratorAutoAcceptOn(e.target.checked)}
                    />
                    <span className="settings-checkbox-text">
                      Apply remembered preferences automatically on your next turn
                    </span>
                  </label>
                </li>
              </ul>
            </section>
          </>
        )}
      </>
    );
  }

  function renderBriefingPanel() {
    return <BriefingSettingsPanel embedded />;
  }

  function renderSecurityPanel() {
    return (
      <>
        <p className="settings-note">
          Calendar and provider credentials stay in your agent vault — never in browser storage.
          Consequential approvals require a hardware-backed passkey.
        </p>
        <CustodySecurityPanel embedded />
      </>
    );
  }

  function renderConnectorsPanel() {
    return (
      <>
        <p className="settings-note">
          Connectors store URLs encrypted on your agent — not in this browser. WebCal for calendar;
          RSS for public feeds; bookmarks for pages your agent can read on request.
        </p>
        {modulesActive && catalog && registry ? (
          <ConnectorModuleHost
            moduleId={WEBCAL_CONNECTOR_MODULE_ID}
            catalog={catalog}
            registry={registry}
            modulesEnabled={modulesActive}
          />
        ) : (
          <WebCalSettingsPanel
            vaultUnlocked={vaultUnlocked}
            embedded
            onFeedsChanged={onWebcalFeedsChanged}
          />
        )}
        <RssSettingsPanel vaultUnlocked={vaultUnlocked} embedded onFeedsChanged={onRssFeedsChanged} />
        <McpSettingsPanel vaultUnlocked={vaultUnlocked} embedded />
        <BookmarksSettingsPanel vaultUnlocked={vaultUnlocked} embedded />
      </>
    );
  }

  function renderAppearancePanel() {
    return (
      <>
        {!productionLocked ? (
          <p className="settings-note">Choose a color theme for the shell.</p>
        ) : null}
        <SkinPicker />
      </>
    );
  }

  function renderPaymentsPanel() {
    return (
      <>
        <p className="settings-note">
          Optional Stripe keys for paid modules and commerce holds. Keys stay on your agent, not in the
          browser.
        </p>
        {hasSavedStripeSecret ? (
          <div className="settings-saved-key">
            <span className="settings-saved-key-label">Secret key</span>
            <span className="settings-saved-key-value">Using saved key ({savedStripeSecretHint})</span>
            <button
              type="button"
              className="settings-saved-key-change"
              onClick={() => {
                setChangingStripeSecret(true);
                setStripeSecretKey("");
              }}
            >
              Change key
            </button>
          </div>
        ) : (
          <label className="atom-field">
            <span className="atom-field-label">Secret key (sk_live_…)</span>
            <input
              type="password"
              value={stripeSecretKey}
              onChange={(e) => setStripeSecretKey(e.target.value)}
            />
          </label>
        )}
        <label className="atom-field">
          <span className="atom-field-label">Publishable key (pk_live_…)</span>
          <input
            value={stripePublishableKey}
            onChange={(e) => setStripePublishableKey(e.target.value)}
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Product id (optional)</span>
          <input
            value={stripeProductId}
            placeholder="prod_… from setup:stripe"
            onChange={(e) => setStripeProductId(e.target.value)}
          />
        </label>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={!stripePaymentValid}
            onClick={saveStripePayment}
          >
            Save payment connection
          </button>
        </div>
      </>
    );
  }

  function renderModulesPanel() {
    if (productionLocked) {
      return (
        <>
          <p className="settings-note">Browse modules from the trusted catalog for this site.</p>
          <p className="settings-note">
            Registry URL, integrity checks, publisher allowlist, and signed manifests are pinned for
            this site.
          </p>
          {moduleCatalogNote ? <p className="settings-note">{moduleCatalogNote}</p> : null}
          <RegistryCatalogList
            indexUrl={PRODUCTION_REGISTRY_URL}
            onStatus={setModuleCatalogNote}
          />
        </>
      );
    }
    return (
      <>
        <p className="settings-note">
          URL of the module catalog your shell loads modules from, plus trust policy for signed
          manifests.
        </p>
        <label className="atom-field">
          <span className="atom-field-label">Index URL</span>
          <input value={registryIndexUrl} onChange={(e) => setRegistryIndexUrl(e.target.value)} />
        </label>
        <label className="atom-field atom-field-checkbox">
          <input
            type="checkbox"
            checked={requireIntegrity}
            onChange={(e) => setRequireIntegrity(e.target.checked)}
          />
          <span>Require manifest integrity hash (recommended)</span>
        </label>
        <label className="atom-field atom-field-checkbox">
          <input
            type="checkbox"
            checked={requireSignature}
            onChange={(e) => setRequireSignature(e.target.checked)}
          />
          <span>Require signed manifests</span>
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Blocked module ids (one per line)</span>
          <textarea
            className="panel-textarea"
            rows={3}
            value={blockedIdsText}
            onChange={(e) => setBlockedIdsText(e.target.value)}
            placeholder="games/untrusted-mod"
          />
        </label>
        <div className="chrome-actions settings-section-actions">
          <button
            className="chrome-approve"
            disabled={!registryIndexUrl.trim()}
            onClick={() =>
              onSaveRegistry(registryIndexUrl.trim(), {
                requireIntegrity,
                requireSignature,
                blockedIds: blockedIdsText
                  .split(/[\n,]/)
                  .map((value) => value.trim())
                  .filter(Boolean),
                trustedPublishers: trustInitial.trustedPublishers,
              })
            }
          >
            Save registry settings
          </button>
        </div>
        {revokedModules.length > 0 ? (
          <div className="settings-revocations">
            <span className="atom-field-label">Revoked modules ({revokedModules.length})</span>
            <ul className="settings-revocations-list">
              {revokedModules.map((item) => (
                <li key={`${item.id}@${item.version}`}>
                  <code>{item.id}@{item.version}</code>
                  {item.reason ? ` — ${item.reason}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="settings-note">No revoked modules in the current index revocations list.</p>
        )}
        <div className="settings-registry-store">
          <span className="atom-field-label">Module store catalog</span>
          {moduleCatalogNote ? <p className="settings-note">{moduleCatalogNote}</p> : null}
          <RegistryCatalogList
            indexUrl={registryIndexUrl.trim() || registryInitial}
            onStatus={setModuleCatalogNote}
          />
        </div>
      </>
    );
  }

  function renderDeveloperPanel() {
    return (
      <>
        <p className="settings-note">
          URL of a server-side chat agent (local dev default: {DEFAULT_AGUI_URL}).
        </p>
        <label className="atom-field">
          <span className="atom-field-label">Agent URL</span>
          <input value={agUiUrl} onChange={(e) => setAgUiUrl(e.target.value)} />
        </label>
        {agUiError ? <p className="settings-note settings-error">{agUiError}</p> : null}
        <div className="chrome-actions settings-section-actions">
          <button
            className="chrome-approve"
            disabled={!agUiValid}
            onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
          >
            Save AG-UI URL
          </button>
        </div>
      </>
    );
  }

  function renderDonationsPanel() {
    return (
      <>
        <p className="settings-note">
          Atom is free, open-source software. There is no account fee to use the shell or self-host an
          agent — we believe that tools for talking with your own agent should stay owned by you.
        </p>
        <p className="settings-note">
          If Atom has been useful, we are grateful for any support. Voluntary donations through Buy Me
          a Coffee help fund ongoing platform work: hardening, new modules, connectors, and the
          hosted infrastructure that keeps the open registry and demo environments available.
        </p>
        <p className="settings-note">
          Support is entirely optional. Atom stays Apache-licensed whether you donate or not.
        </p>
        <div className="chrome-actions settings-section-actions">
          <a
            className="chrome-approve settings-donate-link"
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Support on Buy Me a Coffee
          </a>
        </div>
      </>
    );
  }

  function renderActivePanel() {
    switch (activeSection) {
      case "agent":
        return renderAgentPanel();
      case "briefing":
        return renderBriefingPanel();
      case "security":
        return renderSecurityPanel();
      case "connectors":
        return renderConnectorsPanel();
      case "appearance":
        return renderAppearancePanel();
      case "payments":
        return renderPaymentsPanel();
      case "modules":
        return renderModulesPanel();
      case "developer":
        return renderDeveloperPanel();
      case "donations":
        return renderDonationsPanel();
      default:
        return renderAgentPanel();
    }
  }

  return (
    <div
      className="chrome-overlay settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      onClick={onClose}
    >
      <div className="settings-dialog settings-dialog--sections" onClick={(event) => event.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title">Settings</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <div className="settings-dialog-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item${activeSection === item.id ? " is-active" : ""}`}
                aria-current={activeSection === item.id ? "true" : undefined}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="settings-nav-label">{item.label}</span>
                <span className="settings-nav-hint">{item.hint}</span>
              </button>
            ))}
          </nav>
          <div className="settings-dialog-body">
            <div className="settings-panel">
              <div className="settings-panel-head">
                <h3>{activeNav.label}</h3>
                <p className="settings-panel-desc">{activeNav.hint}</p>
              </div>
              <div className="settings-panel-fields">{renderActivePanel()}</div>
            </div>
          </div>
        </div>
        <div className="settings-dialog-footer">
          {onLogout ? (
            <button type="button" className="chrome-decline settings-logout" onClick={onLogout}>
              Log out
            </button>
          ) : null}
          <div className="settings-dialog-footer-end">
          {intent === "llm" && !productionLocked ? (
            <button
              type="button"
              className="chrome-approve"
              disabled={!llmValid}
              onClick={saveLlmAndEnable}
            >
              Enable Live LLM
            </button>
          ) : null}
          <button type="button" className="chrome-decline" onClick={onClose}>
            Close
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkinPicker() {
  const saved = loadStringFromStorage(SKIN_STORAGE_KEY);
  const initial: AtomSkinId = isAtomSkinId(saved) ? saved : "minimal";
  const [skinId, setSkinId] = useState<AtomSkinId>(initial);

  function applySkin(next: AtomSkinId) {
    setSkinId(next);
    applyAtomSkin(next);
    saveStringToStorage(SKIN_STORAGE_KEY, next);
  }

  return (
    <label className="atom-field">
      <span className="atom-field-label">Skin</span>
      <select value={skinId} onChange={(e) => applySkin(e.target.value as AtomSkinId)}>
        {ATOM_SKINS.map((skin) => (
          <option key={skin.id} value={skin.id}>
            {skin.label}
          </option>
        ))}
      </select>
    </label>
  );
}
