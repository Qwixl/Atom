import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AttestationLog,
  Catalog,
  ConversationRuntime,
  ModuleRegistry,
  createAttestationPersistence,
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
  recordShellModelSighting,
  type LlmConfig,
  type ModelCapabilityProfile,
  type AtomToolExecutor,
  type AtomConnectorId,
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
import { loadBriefingPreferences, BRIEFING_OPEN_MESSAGE, BRIEFING_FIRE_MESSAGE, applyCuratorBriefingTopics, formatBriefingContextForPrompt, rememberBriefingTopic, saveBriefingPreferences } from "./briefing/briefingPreferences.js";
import { BriefingSettingsPanel } from "./briefing/BriefingSettingsPanel.js";
import { StandingIntentsPanel } from "./brain/StandingIntentsPanel.js";
import { PushSettingsPanel } from "./brain/PushSettingsPanel.js";
import {
  ensureCapacitorPush,
  ensureWebPushSubscription,
  loadPushOptIn,
} from "./brain/pushRegistration.js";
import {
  VoicePushToTalk,
  VoiceSettingsPanel,
  loadVoiceOptIn,
} from "./brain/VoicePushToTalk.js";
import {
  canRequestBriefingComposition,
  markBriefingCompositionRequestedThisSession,
  shouldFireBriefingFromPending,
  shouldRecoverBriefingComposition,
  shouldSessionOpenBriefing,
  markSessionOpenBriefingRunToday,
} from "./brain/briefingAutoFire.js";
import { useBrainPendingPoll } from "./brain/useBrainPendingPoll.js";
import { SpendPolicySettingsPanel } from "./billing/SpendPolicySettingsPanel.js";
import { formatLocationContextForPrompt } from "./location/locationContext.js";
import { loadLocationPreferences } from "./location/locationPreferences.js";
import type { DeviceLocationSnapshot } from "./location/deviceLocation.js";
import { ProfilePanel } from "./ProfilePanel.js";
import { SettingsToggle } from "./ui/SettingsToggle.js";
import { useDirtyForm } from "./ui/useDirtyForm.js";
import { DiscoverPanel } from "./DiscoverPanel.js";
import { RoomsPanel } from "./RoomsPanel.js";
import { tryReconnectHostedAgent, completeAgentSetup } from "./auth/completeSetup.js";
import { loadAccountType, saveAccountType, clearAccountType } from "./accountType.js";
import { bareOwnerHandle, loadOwnerHandle, saveOwnerHandle } from "./ownerHandle.js";
import { WorkspaceSwitcher } from "./workspace/WorkspaceSwitcher.js";
import {
  createWorkspace,
  ensureWorkspaceFromAccountType,
  getActiveWorkspace,
  listWorkspaces,
  loadActiveWorkspaceId,
  saveActiveWorkspaceId,
  setActiveWorkspace,
  upsertWorkspace,
} from "./workspace/workspaceRegistry.js";
import { isBusinessWorkspace, type Workspace } from "./workspace/types.js";
import {
  workspaceChatFeedPersistence,
  workspaceConversationMemoryPersistence,
  workspaceOwnerProposalsPersistence,
  workspaceOwnerRecordsPersistence,
  migrateLegacyOwnerPersistenceToPersonal,
} from "./workspace/workspacePersistence.js";
import {
  feedItemsFromChatTexts,
  isChatFeedEnvelope,
  makeChatFeedEnvelope,
  mergeChatFeedEnvelopes,
  persistableChatFeed,
  type ChatFeedEnvelope,
} from "./chat/chatFeedSync.js";
import { loadFirstRunDone, markFirstRunDone, resetFirstRunDone } from "./firstRunStorage.js";
import { navigate } from "./navigation.js";
import { DemoBootstrap } from "./DemoBootstrap.js";
import { PersonalDemoWalkthrough } from "./PersonalDemoWalkthrough.js";
import { calendarAddUrlFromAction } from "./calendarAddLink.js";
import { type DemoCalendarEvent } from "./demoScheduling.js";
import { CommsAgentClient } from "./comms/client.js";
import {
  commsClientAuth,
  getChatSessionToken,
  mintChatSessionToken,
  refreshChatSessionToken,
  setChatSessionToken,
} from "./comms/chatSessionToken.js";
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
import { ConnectorsCatalog } from "./connectors/ConnectorsCatalog.js";
import { requireCustodyApproval } from "./custody/approvalGate.js";
import {
  loadAttestations,
  loadBrainIntents,
  loadChatFeed,
  loadOwnerProposals,
  loadOwnerRecords,
  newStandingIntentId,
  saveAttestations,
  saveBrainIntents,
  saveChatFeed,
  saveOwnerProposals,
  saveOwnerRecords,
  type StandingIntent,
} from "./custody/client.js";
import {
  clearPendingSettingsProposal,
  formatSettingsProposalAck,
  isSoftAssentMessage,
  isSoftDeclineMessage,
  loadPendingSettingsProposal,
  parseSettingsProposalFromAction,
  savePendingSettingsProposal,
  settingsProposalCustodyTerms,
  synthesizeSettingsProposalFromFeed,
  type PendingSettingsProposal,
} from "./settings/pendingSettingsProposal.js";
import {
  LLM_PROVIDER_PRESETS,
  getLlmProviderPreset,
  matchLlmProviderPresetId,
  modelSelectOptions,
  resolveHostedLlmConnection,
  type LlmProviderPresetId,
} from "./settings/llmProviderPresets.js";
import {
  defaultHostedLlmConnectionFields,
  HostedLlmConnectionFields,
  type HostedLlmConnectionFieldsValue,
} from "./settings/HostedLlmConnectionFields.js";
import { loadCommsAgentConfig, loadCommsAgentConfigSecure, saveCommsAgentConfigSecure, clearCommsAdminToken, clearCommsAgentConfig, loadOwnerAgentKind, refreshCommsConfigCache, purgeStaleLocalAgentConfig, isLocalAgentUrl } from "./comms/storage.js";
import { probeAgentConnection, reconcileAgentConnection } from "./comms/agentConnection.js";
import { presentUserError } from "./comms/agentErrors.js";
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
import {
  updateHostedLlmConnection,
  signOutSupabase,
  fetchHostedAccountStatus,
  fetchHostedAgentConnection,
  createHostedWorkspace,
} from "./auth/hostedAccount.js";
import { ShellComposer } from "./shell/ShellComposer.js";
import { ConfirmationChrome } from "./shell/ConfirmationChrome.js";
import { AtomShell, type SettingsOpenTarget } from "./shell/AtomShell.js";
import { IconChevronRight } from "./shell/ShellIcons.js";
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
const APP_STORE_URL_KEY = "atom-app-store-url";
/** Atom App Store front-end (D073). Owner-editable; any compatible store works. */
const DEFAULT_APP_STORE_URL = "https://apps.qwixl.com";
const AGENT_SHOPPER_KEY = "atom-agent-shopper-enabled";
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

const COMMS_LAST_READ_KEY = "atom-comms-last-read";

function restoredChatFeed(workspaceId: string): FeedItem[] {
  const stored = workspaceChatFeedPersistence(workspaceId).load();
  if (!stored?.items?.length) return [];
  return feedItemsFromChatTexts(stored.items);
}

export function App() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => loadActiveWorkspaceId());
  const [workspaces, setWorkspaces] = useState(() => listWorkspaces());
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? getActiveWorkspace(),
    [workspaces, activeWorkspaceId],
  );

  useEffect(() => {
    void migrateLegacyOwnerPersistenceToPersonal().then((migrated) => {
      if (migrated.migratedRecords || migrated.migratedProposals || migrated.migratedMemory) {
        setWorkspaces(listWorkspaces());
      }
    });
  }, []);

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
    () => {
      const recordsPersistence = workspaceOwnerRecordsPersistence(activeWorkspaceId);
      const proposalsPersistence = workspaceOwnerProposalsPersistence(activeWorkspaceId);
      return new OwnerStore({
        persist: (records) => {
          const config = loadCommsAgentConfig();
          if (config.adminToken?.trim()) {
            void saveOwnerRecords(config, records);
            return;
          }
          recordsPersistence.save([...records]);
        },
        restore: recordsPersistence.load(),
        persistProposals: (proposals) => {
          const config = loadCommsAgentConfig();
          if (config.adminToken?.trim()) {
            void saveOwnerProposals(config, proposals);
            return;
          }
          proposalsPersistence.save([...proposals]);
        },
        restoreProposals: proposalsPersistence.load(),
      });
    },
    [activeWorkspaceId],
  );

  const secretStore = useMemo(
    () => (IS_PRODUCTION_HOST ? createProductionSecretStore() : createDefaultSecretStore()),
    [],
  );

  const [agentConnectionReady, setAgentConnectionReady] = useState(false);
  const [agentBootstrapPending, setAgentBootstrapPending] = useState(!IS_DEMO_MODE);
  const [vaultUnlocked, setVaultUnlocked] = useState(() => !isVaultInitialized() || isVaultUnlocked());
  /** React copy of the in-memory chat session bearer so AG-UI rebuilds when it refreshes. */
  const [chatSessionBearer, setChatSessionBearer] = useState<string | null>(null);

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
      setChatSessionBearer(null);
      return;
    }
    void (async () => {
      const config = await loadCommsAgentConfigSecure();
      if (!config.adminToken?.trim() && !usesSupabaseHostedAuth()) {
        setChatSessionToken(null);
        setChatSessionBearer(null);
        return;
      }
      let minted = await mintChatSessionToken(config);
      if (!minted && usesSupabaseHostedAuth()) {
        try {
          const connection = await fetchHostedAgentConnection();
          await saveCommsAgentConfigSecure({
            adminUrl: connection.adminUrl,
            adminToken: connection.adminToken,
          });
          minted =
            connection.sessionToken?.trim() ||
            (await mintChatSessionToken(await loadCommsAgentConfigSecure()));
        } catch (error) {
          console.warn(
            `[session] hosted reconnect failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      // Never wipe a good in-memory session on a flaky remint.
      if (minted) {
        setChatSessionToken(minted);
        setChatSessionBearer(minted);
      } else {
        const existing = getChatSessionToken();
        setChatSessionBearer(existing);
      }
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

  // MBA-7: record model id only (never keys) for ops behavior-admin discovery.
  useEffect(() => {
    const model = llmConnection?.model?.trim();
    if (!model) return;
    try {
      recordShellModelSighting(model);
    } catch {
      /* ignore storage errors */
    }
  }, [llmConnection?.model]);

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
  const [settingsSection, setSettingsSection] = useState<SettingsOpenTarget>("default");
  const [accountOpen, setAccountOpen] = useState(false);

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
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocationSnapshot | null>(null);
  const deviceLocationRef = useRef<DeviceLocationSnapshot | null>(null);

  const applyCalendarContext = useCallback((value: string | undefined) => {
    calendarContextRef.current = value;
    setCalendarContext(value);
  }, []);
  const applyRssContext = useCallback((value: string | undefined) => {
    rssContextRef.current = value;
    setRssContext(value);
  }, []);
  const applyDeviceLocation = useCallback((value: DeviceLocationSnapshot | null) => {
    deviceLocationRef.current = value;
    setDeviceLocation(value);
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
    setProfileRecords(ownerStore.list());
    setProfileProposals(ownerStore.listProposals());
  }, [activeWorkspaceId, ownerStore]);

  useEffect(() => {
    void (async () => {
      const recordsPersistence = workspaceOwnerRecordsPersistence(activeWorkspaceId);
      const [records] = await Promise.all([
        recordsPersistence.hydrateFromIndexedDb(),
        workspaceOwnerProposalsPersistence(activeWorkspaceId).hydrateFromIndexedDb(),
        workspaceConversationMemoryPersistence(activeWorkspaceId).hydrateFromIndexedDb(),
      ]);
      if (!records?.length || ownerStore.list().length > 0) return;
      for (const record of records) {
        ownerStore.upsert(record);
      }
      setProfileRecords(ownerStore.list());
      setCommsContacts(loadContacts(records));
    })();
  }, [ownerStore, activeWorkspaceId]);

  const [curatorEnabled, setCuratorEnabled] = useState(() => loadCuratorEnabled());
  const [curatorAutoAcceptOpen, setCuratorAutoAcceptOpen] = useState(() =>
    loadCuratorAutoAcceptOpen(),
  );
  const [modulesEnabled, setModulesEnabled] = useState(true);
  const [accountType, setAccountType] = useState(() => loadAccountType());
  const [accountHandle, setAccountHandle] = useState(() => {
    const fromStorage = loadOwnerHandle()?.replace(/^@/, "");
    const fromWorkspace = getActiveWorkspace().handle?.replace(/^@/, "");
    return fromStorage || fromWorkspace || "";
  });
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const showModulesToggle = SHOW_DEV_WORKFLOWS || accountType === "developer";
  const modulesActive = showModulesToggle ? modulesEnabled : true;
  const [registryUrl, setRegistryUrl] = useState(() => loadRegistryUrl());
  const [registryTrust, setRegistryTrust] = useState(() => loadRegistryTrust());
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => {
    catalog.setInactiveModuleIds(registryTrust.blockedIds ?? []);
  }, [catalog, registryTrust]);

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
  const chatFeedRef = useRef<readonly FeedItem[]>(restoredChatFeed(activeWorkspaceId));
  const chatFeedEnvelopeRef = useRef<ChatFeedEnvelope | null>(
    workspaceChatFeedPersistence(activeWorkspaceId).load() ?? null,
  );
  const chatFeedSaveTimerRef = useRef<number | null>(null);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
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
    () => {
      const persistence = workspaceConversationMemoryPersistence(activeWorkspaceId);
      return new ConversationMemoryIndex({
        restore: persistence.load() ?? [],
        persist: (chunks) => persistence.save([...chunks]),
      });
    },
    [activeWorkspaceId],
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
        "Calendar snapshot still loading. Call calendar_list_events for fresh data. Do not treat as disconnected.";
      const rss =
        rssContextRef.current ??
        "RSS snapshot still loading. Call rss_list_items for fresh data. Do not treat as disconnected.";
      const location =
        formatLocationContextForPrompt(loadLocationPreferences(), deviceLocationRef.current) ??
        "No home city or one-shot device location. Owner can set home city or tap Use current location once in Settings → Briefing. Atom never tracks location in the background.";
      const withCalendar = { ...base, calendarContext: calendar, rssContext: rss, locationContext: location };
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
    if (!vaultUnlocked) {
      applyCalendarContext(undefined);
      applyRssContext(undefined);
      setConnectedConnectorIds(undefined);
      return;
    }
    void refreshWebcalState();
    void refreshRssState();
  }, [
    vaultUnlocked,
    refreshWebcalState,
    refreshRssState,
    applyCalendarContext,
    applyRssContext,
  ]);

  const connectorContextReady = calendarContext !== undefined && rssContext !== undefined;

  const ensureConnectorContextsReady = useCallback(async () => {
    await Promise.all([refreshWebcalState(), refreshRssState()]);
  }, [refreshWebcalState, refreshRssState]);

  useEffect(() => {
    if (!IS_DEMO_MODE || !demoReady) return;
    void refreshDemoWebcalState();
    const timer = window.setInterval(() => void refreshDemoWebcalState(), 4000);
    return () => window.clearInterval(timer);
  }, [demoReady, refreshDemoWebcalState]);

  useEffect(() => {
    if (!usesSupabaseHostedAuth()) return;
    void fetchHostedAccountStatus()
      .then((status) => {
        if (status.accountType) {
          saveAccountType(status.accountType);
          setAccountType(status.accountType);
          ensureWorkspaceFromAccountType(status.accountType);
          setWorkspaces(listWorkspaces());
        }
        if (status.handle?.trim()) {
          const handle = bareOwnerHandle(status.handle);
          setAccountHandle(handle);
          saveOwnerHandle(handle);
          const personal = listWorkspaces().find((w) => w.kind === "personal");
          if (personal && personal.handle !== handle) {
            upsertWorkspace({ ...personal, handle });
            setWorkspaces(listWorkspaces());
          }
        }
        if (status.displayName?.trim()) {
          setAccountDisplayName(status.displayName.trim());
        }
      })
      .catch(() => {
        /* keep cached account type / handle */
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

  const [connectedConnectorIds, setConnectedConnectorIds] = useState<
    readonly AtomConnectorId[] | undefined
  >(undefined);

  const refreshConnectedConnectors = useCallback(async () => {
    if (IS_DEMO_MODE) {
      setConnectedConnectorIds(undefined);
      return;
    }
    const config = vaultUnlocked
      ? await loadCommsAgentConfigSecure()
      : loadCommsAgentConfig();
    if (!config.adminToken?.trim()) {
      setConnectedConnectorIds(undefined);
      return;
    }
    try {
      const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
      const { configured } = await client.listConfiguredConnectors();
      setConnectedConnectorIds(configured as AtomConnectorId[]);
    } catch {
      // Keep prior list on transient failure; omit filter only when never loaded.
    }
  }, [vaultUnlocked]);

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    if (!vaultUnlocked) {
      setConnectedConnectorIds(undefined);
      return;
    }
    void refreshConnectedConnectors();
  }, [vaultUnlocked, refreshConnectedConnectors]);

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
      setChatSessionBearer(refreshed);
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
      setChatSessionBearer(refreshed);
      return await invokeOnce();
    }
  }, [vaultUnlocked]);

  const agUiSessionKey = provider === "ag-ui" ? agUiConfig.url : null;
  const agUiBearer =
    chatSessionBearer?.trim() ||
    (provider === "ag-ui" ? loadCommsAgentConfig().adminToken?.trim() : undefined) ||
    undefined;

  const session: ShellSession = useMemo(() => {
    if (provider === "llm" && llmConfig) {
      return new LlmAgentSession(llmConfig, catalog, profileProvider, {
        atomToolExecutor,
        atomConnectorsAvailable: agentConnectionReady && !IS_DEMO_MODE,
        connectedConnectorIds,
        mcpToolExecutor,
        mcpServersAvailable: agentConnectionReady && !IS_DEMO_MODE,
      });
    }
    if (provider === "ag-ui") {
      return new AgUiAgentSession({
        ...agUiConfig,
        headers: agUiAuthHeaders(agUiBearer),
        profileProvider,
        connectorExecutor: atomToolExecutor,
        connectorsAvailable: agentConnectionReady && !IS_DEMO_MODE,
      });
    }
    return new MockAgentSession({
      profileProvider,
      webcalEventsProvider: mockWebcalEventsProvider,
    });
  }, [
    provider,
    llmConfig,
    agUiSessionKey,
    agUiBearer,
    catalog,
    profileProvider,
    mockWebcalEventsProvider,
    atomToolExecutor,
    mcpToolExecutor,
    agentConnectionReady,
    connectedConnectorIds,
  ]);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const briefingOpenSentRef = useRef(false);
  /** After [settings-assent], auto-commit the next settingsProposal action. */
  const settingsAssentAwaitingRef = useRef(false);
  const settingsAssentRetryRef = useRef(0);
  /** Dedup brain-fire composition requests per notification id. */
  const briefingFireHandledRef = useRef(new Set<string>());

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
        restoreFeed: restoredChatFeed(activeWorkspaceId),
        onFeedChange: (feed) => {
          chatFeedRef.current = feed;
          const workspaceId = activeWorkspaceIdRef.current;
          const persistence = workspaceChatFeedPersistence(workspaceId);
          const envelope = makeChatFeedEnvelope(
            workspaceId,
            persistableChatFeed(feed),
            chatFeedEnvelopeRef.current,
          );
          chatFeedEnvelopeRef.current = envelope;
          persistence.save(envelope);
          if (chatFeedSaveTimerRef.current) window.clearTimeout(chatFeedSaveTimerRef.current);
          chatFeedSaveTimerRef.current = window.setTimeout(() => {
            void (async () => {
              try {
                const config = await loadCommsAgentConfigSecure();
                if (!config.adminToken?.trim()) return;
                await saveChatFeed(config, workspaceId, chatFeedEnvelopeRef.current);
              } catch {
                /* offline / auth — local cache remains */
              }
            })();
          }, 400);
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
    [activeWorkspaceId, catalog],
  );

  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const requestBriefingComposition = useCallback(async (message: string) => {
    if (briefingOpenSentRef.current) return false;
    if (!canRequestBriefingComposition(providerRef.current)) return false;
    if (calendarContextRef.current === undefined || rssContextRef.current === undefined) {
      await ensureConnectorContextsReady();
    }
    if (briefingOpenSentRef.current) return false;
    briefingOpenSentRef.current = true;
    markBriefingCompositionRequestedThisSession();
    if (message.startsWith("[briefing-open]")) {
      markSessionOpenBriefingRunToday();
    }
    conversationRef.current.setBusy(true);
    sessionRef.current.sendUserMessage(message);
    return true;
  }, [ensureConnectorContextsReady]);

  // Session-open: only when Briefing prefs "show when I open Chat" is on (not standing intents).
  // Hosted Chat is ag-ui — must include both providers. sessionStorage blocks reload spam.
  // Wait until calendar/RSS snapshots settle so the model does not see a false "Not connected".
  useEffect(() => {
    if (IS_DEMO_MODE || !vaultUnlocked || !agentConnectionReady || !connectorContextReady) return;
    if (
      !shouldSessionOpenBriefing({
        provider,
        alreadyRequested: briefingOpenSentRef.current,
        connectorContextReady,
        feed: conversationRef.current.getSnapshot().feed,
      })
    ) {
      return;
    }
    void requestBriefingComposition(BRIEFING_OPEN_MESSAGE);
  }, [
    vaultUnlocked,
    agentConnectionReady,
    connectorContextReady,
    provider,
    requestBriefingComposition,
  ]);

  // Recover legacy "ask me" stubs only — thin "Morning briefing" / "is ready" lines must not re-fire.
  useEffect(() => {
    if (IS_DEMO_MODE || !vaultUnlocked || !agentConnectionReady || !connectorContextReady) return;

    const tryRecover = () => {
      const feed = conversationRef.current.getSnapshot().feed;
      if (
        !shouldRecoverBriefingComposition({
          provider,
          alreadyRequested: briefingOpenSentRef.current,
          feed,
          connectorContextReady,
        })
      ) {
        return;
      }
      void requestBriefingComposition(BRIEFING_FIRE_MESSAGE);
    };

    tryRecover();
    return conversation.subscribe(tryRecover);
  }, [
    vaultUnlocked,
    agentConnectionReady,
    connectorContextReady,
    provider,
    conversation,
    requestBriefingComposition,
  ]);

  useEffect(() => {
    if (!agentConnectionReady || !vaultUnlocked) return;
    void (async () => {
      try {
        const config = await loadCommsAgentConfigSecure();
        if (!config.adminToken?.trim()) return;
        const workspaceId = activeWorkspaceIdRef.current;
        const remoteChatRaw = await loadChatFeed(config, workspaceId);
        const chatPersistence = workspaceChatFeedPersistence(workspaceId);
        const localChat = chatPersistence.load() ?? chatFeedEnvelopeRef.current;
        const remoteChat = isChatFeedEnvelope(remoteChatRaw) ? remoteChatRaw : null;
        if (!remoteChat && localChat?.items?.length) {
          await saveChatFeed(config, workspaceId, localChat);
          chatFeedEnvelopeRef.current = localChat;
          return;
        }
        if (!remoteChat && !localChat) return;
        const merged = mergeChatFeedEnvelopes(localChat, remoteChat, workspaceId);
        chatPersistence.save(merged);
        chatFeedEnvelopeRef.current = merged;
        conversation.replaceTextFeed(feedItemsFromChatTexts(merged.items));
        if (
          !remoteChat ||
          merged.revision !== remoteChat.revision ||
          merged.items.length !== remoteChat.items.length
        ) {
          await saveChatFeed(config, workspaceId, merged);
        }
      } catch (error) {
        console.warn("[custody] chat feed sync failed", error);
      }
    })();
  }, [agentConnectionReady, vaultUnlocked, activeWorkspaceId, conversation]);

  useBrainPendingPoll({
    enabled: Boolean(agentConnectionReady && vaultUnlocked && !IS_DEMO_MODE && conversation),
    conversation,
    onDailyBriefingFire: (n) => {
      if (
        !shouldFireBriefingFromPending({
          notification: n,
          alreadyRequested: briefingOpenSentRef.current,
          handledIds: briefingFireHandledRef.current,
          connectorContextReady,
        })
      ) {
        if (!connectorContextReady) return false;
        // Already requested this session, or duplicate id — ack without a second turn.
        briefingFireHandledRef.current.add(n.id);
        return true;
      }
      if (!canRequestBriefingComposition(providerRef.current)) return false;
      briefingFireHandledRef.current.add(n.id);
      void requestBriefingComposition(BRIEFING_FIRE_MESSAGE).then((ok) => {
        if (!ok) briefingFireHandledRef.current.delete(n.id);
      });
      return true;
    },
  });

  useEffect(() => {
    if (!agentConnectionReady || !vaultUnlocked || IS_DEMO_MODE || !loadPushOptIn()) return;
    let cancelled = false;
    void (async () => {
      try {
        const config = await loadCommsAgentConfigSecure();
        if (cancelled || !config.adminToken?.trim()) return;
        const native = await ensureCapacitorPush(config);
        if (cancelled || native === "subscribed") return;
        await ensureWebPushSubscription(config);
      } catch {
        /* soft-fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentConnectionReady, vaultUnlocked]);

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

  const commitPendingSettingsProposal = useCallback(
    async (proposal: PendingSettingsProposal) => {
      const config = vaultUnlocked
        ? await loadCommsAgentConfigSecure()
        : loadCommsAgentConfig();
      const action = {
        id: proposal.id,
        kind: "permission" as const,
        title: proposal.summary,
        terms: settingsProposalCustodyTerms(proposal),
        confirmLabel: "Approve",
        declineLabel: "Cancel",
      };
      let approvalRef = "";
      // Passkey only when writing the connector vault (RSS). Topic/watch alone skip it.
      if (proposal.rss) {
        try {
          const custody = await requireCustodyApproval(action, config);
          approvalRef = custody.approvalRef;
        } catch (error) {
          conversationRef.current.appendLocalAgentText(
            presentUserError(error, {
              accountType: loadAccountType(),
              showTechnicalDetail: SHOW_DEV_WORKFLOWS,
            }) + " Say yes again when you're ready, or “not now” to cancel.",
          );
          conversationRef.current.setBusy(false);
          return;
        }
      }

      await attestationLog.append({
        surfaceId: "settings-proposal",
        action,
        decision: "approved",
      });
      setAttestations([...attestationLog.list()]);

      const client = new CommsAgentClient(config.adminUrl, commsClientAuth(config));
      if (proposal.rss) {
        await client.addRssFeed(proposal.rss.url, proposal.rss.label, approvalRef);
        await refreshRssState();
      }
      if (proposal.topic) {
        const prefs = loadBriefingPreferences();
        saveBriefingPreferences({ ...prefs, enabled: true });
        rememberBriefingTopic(proposal.topic);
      }
      if (proposal.watch) {
        const existing = await loadBrainIntents(config);
        const nowIso = new Date().toISOString();
        const watchIntent: StandingIntent = {
          id: newStandingIntentId(),
          kind: "watch",
          enabled: true,
          title: proposal.watch.query.slice(0, 80),
          trigger: { type: "interval", everyMinutes: proposal.watch.everyMinutes },
          scope: { query: proposal.watch.query },
          delivery: { channel: "chat" },
          lastFiredAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await saveBrainIntents(config, [...existing, watchIntent]);
      }

      clearPendingSettingsProposal();
      conversationRef.current.appendLocalAgentText(formatSettingsProposalAck(proposal));
      conversationRef.current.setBusy(false);
      try {
        sessionRef.current.sendActionDecision(proposal.id, "approved");
      } catch {
        /* optional */
      }
    },
    [vaultUnlocked, attestationLog, refreshRssState],
  );

  // Soft-confirm settings proposals: stash and hide chrome until the owner assents in chat.
  // If the owner already assented (settings-assent path), commit immediately when the action arrives.
  useEffect(() => {
    if (!pending?.action) return;
    const proposal = parseSettingsProposalFromAction(pending.action);
    if (!proposal) return;
    savePendingSettingsProposal(proposal);
    conversationRef.current.clearPending();
    if (settingsAssentAwaitingRef.current) {
      settingsAssentAwaitingRef.current = false;
      settingsAssentRetryRef.current = 0;
      void commitPendingSettingsProposal(proposal);
    }
  }, [pending, commitPendingSettingsProposal]);

  // Assent turn finished with no settingsProposal — retry once, then fail honestly.
  useEffect(() => {
    if (busy || !settingsAssentAwaitingRef.current) return;
    if (loadPendingSettingsProposal()) return;
    if (settingsAssentRetryRef.current < 1) {
      settingsAssentRetryRef.current += 1;
      conversationRef.current.appendLocalAgentText(
        "I confirmed in words but didn't attach the setup action — retrying once.",
      );
      conversationRef.current.setBusy(true);
      turnTranscript.current = [];
      try {
        sessionRef.current.sendUserMessage(
          "[settings-assent-retry] Owner already confirmed. Emit exactly one consequential-action " +
            "with settingsProposal:true, topic, and watchQuery from the prior track/alert request. " +
            "Short ack only — no briefing-daily. Example terms: " +
            '{"settingsProposal":true,"summary":"Keep me updated on XRP","topic":"XRP price",' +
            '"watchQuery":"XRP price move of about 5% or more over a week","everyMinutes":60}',
        );
      } catch (error) {
        settingsAssentAwaitingRef.current = false;
        settingsAssentRetryRef.current = 0;
        conversationRef.current.appendLocalAgentText(
          presentUserError(error, {
            accountType: loadAccountType(),
            showTechnicalDetail: SHOW_DEV_WORKFLOWS,
          }),
        );
        conversationRef.current.setBusy(false);
      }
      return;
    }
    settingsAssentAwaitingRef.current = false;
    settingsAssentRetryRef.current = 0;
    conversationRef.current.appendLocalAgentText(
      "I still couldn't save that setup (missing the settings action). Ask me again to track it — I'll attach the proposal this time.",
    );
  }, [busy]);

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
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
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
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
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
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
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
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
      );
      conversationRef.current.setBusy(false);
    }
  }

  async function submitMessage(text: string) {
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

    const pendingProposal = loadPendingSettingsProposal();
    if (pendingProposal && isSoftDeclineMessage(trimmed)) {
      clearPendingSettingsProposal();
      conversationRef.current.appendUser(trimmed);
      setInput("");
      conversationRef.current.appendLocalAgentText(
        "Okay — I won't change your feeds or alerts. Say if you want to revisit later.",
      );
      try {
        sessionRef.current.sendActionDecision(pendingProposal.id, "declined");
      } catch {
        /* session may not care */
      }
      return;
    }
    if (isSoftAssentMessage(trimmed)) {
      if (pendingProposal) {
        conversationRef.current.appendUser(trimmed);
        setInput("");
        conversationRef.current.setBusy(true);
        try {
          await commitPendingSettingsProposal(pendingProposal);
        } catch (error) {
          conversationRef.current.appendLocalAgentText(
            presentUserError(error, {
              accountType,
              showTechnicalDetail: SHOW_DEV_WORKFLOWS,
            }),
          );
          conversationRef.current.setBusy(false);
        }
        return;
      }
      // Agent soft-asked in text but never emitted settingsProposal — recover from the owner's request.
      const synthesized = synthesizeSettingsProposalFromFeed(
        conversationRef.current.getSnapshot().feed,
      );
      if (synthesized) {
        conversationRef.current.appendUser(trimmed);
        setInput("");
        conversationRef.current.setBusy(true);
        try {
          await commitPendingSettingsProposal(synthesized);
        } catch (error) {
          conversationRef.current.appendLocalAgentText(
            presentUserError(error, {
              accountType,
              showTechnicalDetail: SHOW_DEV_WORKFLOWS,
            }),
          );
          conversationRef.current.setBusy(false);
        }
        return;
      }
      // Last resort: nudge the agent to emit a proposal, then auto-commit when it arrives.
      conversationRef.current.appendUser(trimmed);
      setInput("");
      conversationRef.current.setBusy(true);
      turnTranscript.current = [];
      settingsAssentAwaitingRef.current = true;
      settingsAssentRetryRef.current = 0;
      try {
        sessionRef.current.sendUserMessage(
          "[settings-assent] Owner confirmed your offer to track/update/alert. " +
            "Emit exactly one consequential-action with settingsProposal:true " +
            "(topic and/or watchQuery required; url/label only if you have a real RSS URL). " +
            "Short text ack only — do NOT emit briefing-daily or claim settings are saved yet.",
        );
      } catch (error) {
        settingsAssentAwaitingRef.current = false;
        conversationRef.current.appendLocalAgentText(
          presentUserError(error, {
            accountType,
            showTechnicalDetail: SHOW_DEV_WORKFLOWS,
          }),
        );
        conversationRef.current.setBusy(false);
      }
      return;
    }

    const looksLikeBriefing =
      /\[briefing-(?:open|fire)\]/i.test(trimmed) ||
      /\b(?:today'?s?|daily)\s+brie?fing\b/i.test(trimmed) ||
      /\bbrie?fing\b/i.test(trimmed);
    if (looksLikeBriefing && (calendarContextRef.current === undefined || rssContextRef.current === undefined)) {
      conversationRef.current.setBusy(true);
      try {
        await ensureConnectorContextsReady();
      } catch {
        /* refresh errors already land in context strings */
      }
    }
    turnTranscript.current = [];
    conversationRef.current.appendUser(trimmed);
    setInput("");
    conversationRef.current.setBusy(true);
    try {
      sessionRef.current.sendUserMessage(trimmed);
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
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
        presentUserError(error, {
          accountType,
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
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
        setCustodyError(
          presentUserError(error, {
            accountType,
            showTechnicalDetail: SHOW_DEV_WORKFLOWS,
          }),
        );
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

  const settingsProposalPending =
    pending?.action && parseSettingsProposalFromAction(pending.action)
      ? true
      : false;

  const chromePending =
    pending && !settingsProposalPending
      ? pending
      : commsPending
        ? { action: commsPending.action, surfaceId: "comms", dataRequest: undefined }
        : null;

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
    setSettingsSection("default");
  }

  function openSettings(target: SettingsOpenTarget = "default") {
    setAccountOpen(false);
    setSettingsIntent(null);
    setSettingsSection(target);
    setSettingsOpen(true);
  }

  function closeAccount() {
    setAccountOpen(false);
  }

  function openAccount() {
    setSettingsOpen(false);
    setSettingsIntent(null);
    setAccountOpen(true);
  }

  const demoLlmReady = isLlmConnectionReady(llmConnection, secretStore);
  const showMainFeed =
    (IS_DEMO_MODE && demoReady && panel !== "log") || (!IS_DEMO_MODE && panel === "none");
  const showMainComposer = showMainFeed;

  function navigatePanel(next: SidePanel): void {
    // Profile / Log live in Settings — never as top-level sections.
    if (next === "profile" || next === "log") {
      openSettings(next);
      setPanel("none");
      return;
    }
    setPanel(next);
  }

  const loadedGames = useMemo(
    () =>
      listGameModuleIds()
        .filter(
          (moduleId) => catalog.isModuleInstalled(moduleId) && catalog.isModuleActive(moduleId),
        )
        .map((moduleId) => ({ moduleId, label: gameModuleLabel(moduleId) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [catalog, registryTrust],
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
        onOpenSettings={openSettings}
        onOpenAccount={openAccount}
        onLogout={() => void handleLogout()}
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
                <span className="atom-status-label">Registry error</span>
                <span className="atom-status-compact" aria-hidden="true">
                  Reg
                </span>
              </span>
            ) : null}
            {isVaultInitialized() ? (
              <span
                className="atom-app-status"
                title={vaultUnlocked ? "Vault unlocked" : "Vault locked"}
                aria-label={vaultUnlocked ? "Vault unlocked" : "Vault locked"}
              >
                <span
                  className={`atom-status-dot${vaultUnlocked ? " atom-status-dot--active" : ""}`}
                  aria-hidden="true"
                />
                <span className="atom-status-label">
                  {vaultUnlocked ? "Vault unlocked" : "Vault locked"}
                </span>
              </span>
            ) : null}
            {showModulesToggle ? (
              <button
                type="button"
                className="btn btn-ghost atom-modules-toggle"
                aria-pressed={modulesEnabled}
                aria-label={`Modules ${modulesEnabled ? "on" : "off"}`}
                title={`Modules ${modulesEnabled ? "on" : "off"}`}
                onClick={() => setModulesEnabled((current) => !current)}
              >
                <span className="atom-status-label">
                  Modules {modulesEnabled ? "on" : "off"}
                </span>
                <span className="atom-status-compact" aria-hidden="true">
                  Mods {modulesEnabled ? "on" : "off"}
                </span>
              </button>
            ) : null}
          </>
        }
        composer={
          showMainComposer ? (
            <>
              <VoicePushToTalk
                enabled={loadVoiceOptIn() && Boolean(agentConnectionReady && vaultUnlocked)}
                onTranscript={async (text) => {
                  conversationRef.current.setBusy(true);
                  sessionRef.current.sendUserMessage(text);
                  // Wait for the agent turn to finish, then return last agent text for TTS.
                  return await new Promise<string | null>((resolve) => {
                    let sawBusy = conversation.getSnapshot().busy;
                    const unsub = conversation.subscribe(() => {
                      const snap = conversation.getSnapshot();
                      if (snap.busy) {
                        sawBusy = true;
                        return;
                      }
                      if (!sawBusy) return;
                      unsub();
                      const lastAgent = [...snap.feed]
                        .reverse()
                        .find((item) => item.kind === "agent-text");
                      resolve(
                        lastAgent && lastAgent.kind === "agent-text" ? lastAgent.text : null,
                      );
                    });
                    window.setTimeout(() => {
                      unsub();
                      resolve(null);
                    }, 90_000);
                  });
                }}
              />
              <ShellComposer
                value={input}
                busy={busy}
                onChange={setInput}
                onSubmit={submitMessage}
              />
            </>
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
            waitingForConfirm={Boolean(pending && !commsPending && !settingsProposalPending)}
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
                  <FeedAgentText
                    key={item.id}
                    text={item.text}
                    origin={item.origin}
                    brainKind={item.brainKind}
                    onLinkIntent={submitLinkIntent}
                  />
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
          initialSection={settingsSection}
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
          onWebcalFeedsChanged={() => {
            void refreshWebcalState();
            void refreshConnectedConnectors();
          }}
          onRssFeedsChanged={() => {
            void refreshRssState();
            void refreshConnectedConnectors();
          }}
          deviceLocation={deviceLocation}
          onDeviceLocationChange={applyDeviceLocation}
          agentConnectionReady={agentConnectionReady}
          resolveLlmApiKey={() =>
            llmConnection ? secretStore.get(llmConnection.secretRef) ?? null : null
          }
          onSwitchChatProvider={switchProvider}
          onClose={closeSettings}
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
            const urlChanged = url !== registryUrl;
            saveStringToStorage(REGISTRY_URL_KEY, url);
            saveJsonToStorage(REGISTRY_TRUST_KEY, trust);
            setRegistryTrust(trust);
            catalog.setInactiveModuleIds(trust.blockedIds ?? []);
            setRegistryError(null);
            if (urlChanged) {
              registry.uninstallAll(catalog);
              registry.clearCache();
              setRegistryUrl(url);
              void registry.refreshRevocations().then(() => {
                setRevokedModules(registry.listRevoked());
              });
            }
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
          activeWorkspaceId={activeWorkspaceId}
          profilePanel={
            <ProfilePanel
              store={ownerStore}
              records={profileRecords}
              proposals={profileProposals}
              showBusinessSections={isBusinessWorkspace(activeWorkspace)}
              embeddedInSettings
              lockedHandle={
                accountHandle ||
                loadOwnerHandle()?.replace(/^@/, "") ||
                activeWorkspace.handle?.replace(/^@/, "") ||
                undefined
              }
              accountDisplayName={accountDisplayName || undefined}
              onChanged={() => {
                setProfileRecords(ownerStore.list());
                setProfileProposals(ownerStore.listProposals());
                setCommsContacts(loadContacts(ownerStore.list()));
              }}
            />
          }
          logPanel={
            <>
              <p className="settings-note">
                A private record of decisions you approved or declined.
              </p>
              {attestations.length === 0 ? (
                <p className="panel-empty">No decisions recorded yet.</p>
              ) : (
                <div className="attestation-list">
                  {attestations.map((entry) => {
                    const termEntries = Object.entries(entry.displayedTerms);
                    return (
                      <details key={entry.seq} className={`attestation attestation-compact attestation-${entry.decision}`}>
                        <summary className="attestation-summary">
                          <span className={`attestation-decision attestation-decision--${entry.decision}`}>
                            {entry.decision}
                          </span>
                          <span className="attestation-summary-title">{entry.action.title}</span>
                          <span className="attestation-summary-time">
                            {new Date(entry.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </summary>
                        <div className="attestation-details">
                          {termEntries.length > 0 ? (
                            <dl className="attestation-terms">
                              {termEntries.map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>{String(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          <div className="attestation-hash">{entry.hash.slice(0, 16)}…</div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </>
          }
          profileBadge={profileNavBadge}
          logBadgeCount={attestations.length}
        />
      ) : null}

      {accountOpen ? (
        <AccountDialog
          accountType={accountType}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          productionLocked={IS_PRODUCTION_HOST}
          agUiInitial={agUiConfig}
          onClose={closeAccount}
          onLogout={() => void handleLogout()}
          onWorkspaceSwitch={async (workspaceId) => {
            if (!setActiveWorkspace(workspaceId)) return;
            setActiveWorkspaceId(workspaceId);
            if (MANAGED_HOSTING && loadOwnerAgentKind(loadCommsAgentConfig()) === "hosted") {
              try {
                const connection = await fetchHostedAgentConnection(workspaceId);
                await completeAgentSetup({
                  adminUrl: connection.adminUrl,
                  adminToken: connection.adminToken,
                  sessionToken: connection.sessionToken,
                  handle: connection.handle,
                  kind: "hosted",
                  skipConnectionProbe: true,
                });
                setAgUiConfig(saveAgUiConfigForAgent(connection.adminUrl));
                refreshCommsConfigCache();
              } catch (error) {
                console.warn(
                  `[workspace] hosted reconnect failed: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          }}
          onCreateBusinessWorkspace={async () => {
            if (MANAGED_HOSTING && loadOwnerAgentKind(loadCommsAgentConfig()) === "hosted") {
              try {
                const { workspace, agent } = await createHostedWorkspace({
                  kind: "business",
                  label: "Business",
                });
                upsertWorkspace({
                  id: workspace.id,
                  kind: workspace.kind as Workspace["kind"],
                  label: workspace.label,
                  handle: workspace.handle,
                  createdAt: workspace.createdAt ?? new Date().toISOString(),
                });
                setWorkspaces(listWorkspaces());
                const next = setActiveWorkspace(workspace.id);
                if (next) setActiveWorkspaceId(next.id);
                if (agent?.agentUrl && !agent.status.startsWith("failed")) {
                  const connection = await fetchHostedAgentConnection(workspace.id);
                  await completeAgentSetup({
                    adminUrl: connection.adminUrl,
                    adminToken: connection.adminToken,
                    sessionToken: connection.sessionToken,
                    handle: connection.handle,
                    kind: "hosted",
                    skipConnectionProbe: true,
                  });
                  setAgUiConfig(saveAgUiConfigForAgent(connection.adminUrl));
                  refreshCommsConfigCache();
                }
                return;
              } catch (error) {
                console.warn(
                  `[workspace] hosted create failed: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
            const created = createWorkspace({ kind: "business", label: "Business" });
            setWorkspaces(listWorkspaces());
            const next = setActiveWorkspace(created.id);
            if (next) setActiveWorkspaceId(next.id);
          }}
          onSaveAgUi={(config) => {
            const err = validateProductionAgUiUrl(config.url);
            if (err) return;
            saveJsonToStorage(AGUI_CONFIG_KEY, config);
            setAgUiConfig(config);
            saveStringToStorage(PROVIDER_KEY, "ag-ui");
            setProvider("ag-ui");
            conversationRef.current.reset();
          }}
        />
      ) : null}
    </>
  );
}


function AccountDialog({
  accountType,
  workspaces,
  activeWorkspaceId,
  productionLocked,
  agUiInitial,
  onClose,
  onLogout,
  onWorkspaceSwitch,
  onCreateBusinessWorkspace,
  onSaveAgUi,
}: {
  accountType?: "user" | "business" | "developer";
  workspaces: Workspace[];
  activeWorkspaceId: string;
  productionLocked: boolean;
  agUiInitial: AgUiAgentConfig;
  onClose: () => void;
  onLogout?: () => void;
  onWorkspaceSwitch: (workspaceId: string) => void | Promise<void>;
  onCreateBusinessWorkspace: () => void | Promise<void>;
  onSaveAgUi: (config: AgUiAgentConfig) => void;
}) {
  const [activeSection, setActiveSection] = useState<"overview" | "developer">("overview");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [agUiUrl, setAgUiUrl] = useState(agUiInitial.url);
  const agUiError = validateProductionAgUiUrl(agUiUrl);
  const agUiValid = !agUiError;
  const agUiChanged = agUiUrl.trim() !== agUiInitial.url.trim();
  const showDeveloper = !productionLocked || accountType === "developer";

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const typeLabel =
    accountType === "business"
      ? "Business"
      : accountType === "developer"
        ? "Developer"
        : accountType === "user"
          ? "Personal"
          : "Local";

  const navItems: Array<{ id: "overview" | "developer"; label: string; hint: string }> = [
    { id: "overview", label: "Overview", hint: "Workspace and sign-in" },
  ];
  if (showDeveloper) {
    navItems.push({ id: "developer", label: "Developer", hint: "AG-UI agent URL" });
  }

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0]!;

  function selectSection(id: "overview" | "developer") {
    setActiveSection(id);
    setMobileDetailOpen(true);
  }

  return (
    <div
      className="chrome-overlay settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-dialog-title"
      onClick={onClose}
    >
      <div className="settings-dialog settings-dialog--sections" onClick={(event) => event.stopPropagation()}>
        <div className="settings-dialog-header">
          {mobileDetailOpen ? (
            <button
              type="button"
              className="settings-heading-back"
              id="account-dialog-title"
              onClick={() => setMobileDetailOpen(false)}
            >
              <IconChevronRight className="settings-back-icon settings-back-icon--left" />
              Account
            </button>
          ) : (
            <h2 id="account-dialog-title">Account</h2>
          )}
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close account">
            ×
          </button>
        </div>
        <div
          className={`settings-dialog-layout${mobileDetailOpen ? " settings-dialog-layout--detail" : " settings-dialog-layout--list"}`}
        >
          <nav className="settings-nav" aria-label="Account sections">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item${activeSection === item.id ? " is-active" : ""}`}
                aria-current={activeSection === item.id ? "true" : undefined}
                onClick={() => selectSection(item.id)}
              >
                <span className="settings-nav-label">{item.label}</span>
                <span className="settings-nav-hint">{item.hint}</span>
                <IconChevronRight className="settings-nav-chevron" />
              </button>
            ))}
          </nav>
          <div className="settings-dialog-body">
            <div className="settings-panel">
              <div className="settings-panel-head">
                <h3>{activeNav.label}</h3>
                <p className="settings-panel-desc">{activeNav.hint}</p>
              </div>
              <div className="settings-panel-fields">
                {activeSection === "developer" ? (
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
                        disabled={!agUiValid || !agUiChanged}
                        onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
                      >
                        Save AG-UI URL
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="settings-note">
                      Switch between your personal and business workspaces. Theme lives under Settings → Appearance.
                    </p>
                    <dl className="settings-account-summary">
                      <div>
                        <dt>Account type</dt>
                        <dd>{typeLabel}</dd>
                      </div>
                      <div>
                        <dt>Active workspace</dt>
                        <dd>{active ? `${active.label} (${active.kind})` : "—"}</dd>
                      </div>
                    </dl>
                    <WorkspaceSwitcher
                      workspaces={workspaces}
                      activeWorkspaceId={activeWorkspaceId}
                      onSwitch={onWorkspaceSwitch}
                      onCreateBusiness={onCreateBusinessWorkspace}
                    />
                    {onLogout ? (
                      <div className="chrome-actions settings-section-actions">
                        <button type="button" className="chrome-decline" onClick={onLogout}>
                          ← Exit
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="settings-dialog-footer">
          <div className="settings-dialog-footer-end">
            <button type="button" className="chrome-decline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({
  initialSection = "default",
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
  deviceLocation,
  onDeviceLocationChange,
  agentConnectionReady,
  resolveLlmApiKey,
  onSwitchChatProvider,
  onClose,
  onSaveLlm,
  onSaveStripePayment,
  onSaveAgUi,
  onSaveRegistry,
  onSaveCurator,
  activeWorkspaceId,
  profilePanel,
  logPanel,
  profileBadge = null,
  logBadgeCount = 0,
}: {
  initialSection?: SettingsOpenTarget;
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
  onWebcalFeedsChanged?: () => void | Promise<void>;
  onRssFeedsChanged?: () => void;
  deviceLocation?: DeviceLocationSnapshot | null;
  onDeviceLocationChange?: (snapshot: DeviceLocationSnapshot | null) => void;
  agentConnectionReady: boolean;
  resolveLlmApiKey: () => string | null;
  onSwitchChatProvider: (provider: Provider) => void;
  onClose: () => void;
  onSaveLlm: (connection: LlmConnectionConfig, apiKey?: string) => void;
  onSaveStripePayment: (connection: PaymentConnectionConfig, secretKey?: string) => void;
  onSaveAgUi: (config: AgUiAgentConfig) => void;
  onSaveRegistry: (url: string, trust: RegistryTrustPolicy) => void;
  onSaveCurator: (enabled: boolean, autoAcceptOpen: boolean) => void;
  activeWorkspaceId: string;
  profilePanel: ReactNode;
  logPanel: ReactNode;
  profileBadge?: { count: number; tone: "default" | "warn" } | null;
  logBadgeCount?: number;
}) {
  const [baseUrl, setBaseUrl] = useState(
    llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(llmConnectionInitial?.model ?? "");
  const [providerPresetId, setProviderPresetId] = useState<LlmProviderPresetId>(() =>
    matchLlmProviderPresetId(llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1"),
  );
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
  const providerPreset = getLlmProviderPreset(providerPresetId);
  const modelSelectIds = useMemo(
    () =>
      modelSelectOptions({
        presetId: providerPresetId,
        apiModels: modelOptions,
        currentModel: model,
        apiListOk: modelsFromApi === true,
      }),
    [providerPresetId, modelOptions, model, modelsFromApi],
  );

  function applyProviderPreset(id: LlmProviderPresetId) {
    const next = getLlmProviderPreset(id);
    setProviderPresetId(id);
    if (next.baseUrl) setBaseUrl(next.baseUrl);
    if (next.suggestedModels.length > 0 && !next.suggestedModels.includes(model.trim())) {
      setModel(next.suggestedModels[0]!);
    }
  }
  const [agUiUrl, setAgUiUrl] = useState(agUiInitial.url);
  const [registryIndexUrl, setRegistryIndexUrl] = useState(registryInitial);
  const [appStoreUrl, setAppStoreUrl] = useState(
    () => loadStringFromStorage(APP_STORE_URL_KEY)?.trim() || DEFAULT_APP_STORE_URL,
  );
  const [agentShopperOn, setAgentShopperOn] = useState(
    () => loadBooleanFromStorage(AGENT_SHOPPER_KEY, false),
  );
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
  const memoryForm = useMemo(
    () => ({ curatorOn, curatorAutoAcceptOn }),
    [curatorOn, curatorAutoAcceptOn],
  );
  const { dirty: memoryDirty, markClean: markMemoryClean } = useDirtyForm(memoryForm);
  const advancedRegistryForm = useMemo(
    () => ({
      appStoreUrl: appStoreUrl.trim() || DEFAULT_APP_STORE_URL,
      registryIndexUrl: registryIndexUrl.trim(),
      requireIntegrity,
      requireSignature,
    }),
    [appStoreUrl, registryIndexUrl, requireIntegrity, requireSignature],
  );
  const { dirty: advancedRegistryDirty, markClean: markAdvancedRegistryClean } =
    useDirtyForm(advancedRegistryForm);
  const llmChanged =
    baseUrl.trim() !== (llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1").trim() ||
    model.trim() !== (llmConnectionInitial?.model ?? "").trim() ||
    changingKey ||
    (!hasSavedKey && Boolean(apiKey.trim()));
  const localEndpointChanged =
    baseUrl.trim() !== (llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1").trim();
  const agUiChanged = agUiUrl.trim() !== agUiInitial.url.trim();
  const isHostedAgent =
    productionLocked && MANAGED_HOSTING && loadOwnerAgentKind(loadCommsAgentConfig()) === "hosted";
  const [hostedLlm, setHostedLlm] = useState<HostedLlmConnectionFieldsValue>(() =>
    defaultHostedLlmConnectionFields("openai"),
  );
  const [hostedLlmBusy, setHostedLlmBusy] = useState(false);
  const [hostedLlmNote, setHostedLlmNote] = useState<string | null>(null);
  const [hostedLlmError, setHostedLlmError] = useState<string | null>(null);
  const [moduleCatalogNote, setModuleCatalogNote] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    | "profile"
    | "log"
    | "agent"
    | "briefing"
    | "security"
    | "connectors"
    | "appearance"
    | "modules"
    | "payments"
    | "donations"
  >(() => {
    if (initialSection === "profile" || initialSection === "log") {
      return initialSection;
    }
    return "agent";
  });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(
    () => initialSection === "profile" || initialSection === "log",
  );

  const navItems = useMemo(() => {
    const items: Array<{
      id: typeof activeSection;
      label: string;
      hint: string;
    }> = [
      { id: "profile", label: "Profile", hint: "About you and what your agent remembers" },
      { id: "log", label: "Log", hint: "Decisions you approved" },
      { id: "agent", label: "Agent", hint: "Chat connection" },
      { id: "briefing", label: "Briefing", hint: "Morning roundup" },
      { id: "security", label: "Security", hint: "Vault and passkey" },
      { id: "connectors", label: "Connectors", hint: "Calendars, news, and apps" },
      { id: "appearance", label: "Appearance", hint: "Look and feel" },
      { id: "modules", label: "Modules", hint: "Add-ons and marketplace" },
      { id: "donations", label: "Donations", hint: "Support Atom" },
    ];
    if (!productionLocked) {
      items.splice(7, 0, {
        id: "payments",
        label: "Agent Shopper",
        hint: "Let your agent shop within limits",
      });
    }
    return items;
  }, [productionLocked]);

  async function saveHostedLlmKey() {
    const resolved = resolveHostedLlmConnection({
      providerId: hostedLlm.providerId,
      baseUrl: hostedLlm.baseUrl,
      model: hostedLlm.model,
    });
    const key = hostedLlm.apiKey.trim();
    if (!key) {
      setHostedLlmError("Enter your LLM API key.");
      return;
    }
    if (!resolved.baseUrl.trim() || !resolved.model.trim()) {
      setHostedLlmError(
        hostedLlm.providerId === "custom"
          ? "Add an endpoint base URL and model id."
          : "Choose a model for your provider.",
      );
      return;
    }
    setHostedLlmBusy(true);
    setHostedLlmError(null);
    setHostedLlmNote(null);
    try {
      await updateHostedLlmConnection({
        llmApiKey: key,
        llmProvider: resolved.provider,
        llmBaseUrl: resolved.baseUrl,
        llmModel: resolved.model,
      });
      setHostedLlm((prev) => ({ ...prev, apiKey: "" }));
      setHostedLlmNote(
        "LLM connection updated. Your agent will restart briefly — try chat again in a moment.",
      );
    } catch (error) {
      setHostedLlmError(
        presentUserError(error, {
          accountType: loadAccountType(),
          showTechnicalDetail: SHOW_DEV_WORKFLOWS,
        }),
      );
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
    if (intent === "llm") {
      setActiveSection("agent");
      setMobileDetailOpen(true);
    }
  }, [intent]);

  const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0]!;

  function selectSettingsSection(id: typeof activeSection) {
    setActiveSection(id);
    setMobileDetailOpen(true);
  }

  const [agentTab, setAgentTab] = useState<"external" | "local">(() => {
    const saved = loadStringFromStorage("atom-llm-mode");
    if (saved === "local" || saved === "external") return saved;
    return "external";
  });
  /** Preferred connection tab on next open — independent of live chat provider. */
  const [llmMode, setLlmMode] = useState<"external" | "local">(() => {
    const saved = loadStringFromStorage("atom-llm-mode");
    if (saved === "local" || saved === "external") return saved;
    return "external";
  });

  function preferProviderMode(mode: "external" | "local") {
    setLlmMode(mode);
    saveStringToStorage("atom-llm-mode", mode);
  }

  function renderAgentPanel() {
    if (productionLocked) {
      return (
        <>
          <p className="settings-note">
            {isHostedAgent
              ? "Chat runs on your Atom agent. Choose OpenAI, OpenRouter (one key, many models), or a custom OpenAI-compatible endpoint."
              : "Chat runs through your agent on this site. Your API keys stay on the server, not in the browser."}
          </p>
          {isHostedAgent ? (
            <>
              <HostedLlmConnectionFields value={hostedLlm} onChange={setHostedLlm} />
              {hostedLlmError ? (
                <p className="settings-note settings-error">{hostedLlmError}</p>
              ) : null}
              {hostedLlmNote ? <p className="settings-note">{hostedLlmNote}</p> : null}
              <div className="chrome-actions settings-section-actions">
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={hostedLlmBusy || !hostedLlm.apiKey.trim()}
                  onClick={() => void saveHostedLlmKey()}
                >
                  {hostedLlmBusy ? "Updating…" : "Update LLM connection"}
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
                  disabled={!agUiValid || !agUiChanged}
                  onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
                >
                  Save chat agent URL
                </button>
              </div>
            </div>
          </details>
          <StandingIntentsPanel vaultUnlocked={vaultUnlocked} embedded />
          <PushSettingsPanel vaultUnlocked={vaultUnlocked} embedded />
          <VoiceSettingsPanel embedded />
        </>
      );
    }

    return (
      <>
        <div
          className="shell-segmented settings-agent-tabs"
          role="tablist"
          aria-label="Chat connection"
        >
          <button
            type="button"
            role="tab"
            aria-selected={agentTab === "external"}
            className={agentTab === "external" ? "is-active" : ""}
            onClick={() => setAgentTab("external")}
          >
            External Provider
          </button>
          {allowBrowserLlm ? (
            <button
              type="button"
              role="tab"
              aria-selected={agentTab === "local"}
              className={agentTab === "local" ? "is-active" : ""}
              onClick={() => setAgentTab("local")}
            >
              Local Model
            </button>
          ) : null}
        </div>

        {agentTab === "external" ? (
          <div className="settings-agent-tab-panel" role="tabpanel">
            <SettingsToggle
              checked={llmMode === "external"}
              label="Use Provider"
              onChange={(checked) => {
                if (checked) preferProviderMode("external");
                else if (llmMode === "external") preferProviderMode("local");
              }}
            />
            <p className="settings-note">
              Connect a chat model for local development. Your key stays in this browser session only.
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Provider</span>
              <select
                value={providerPresetId}
                onChange={(e) => applyProviderPreset(e.target.value as LlmProviderPresetId)}
              >
                {LLM_PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {providerPreset.note ? <p className="settings-note">{providerPreset.note}</p> : null}
            <label className="atom-field">
              <span className="atom-field-label">Endpoint base URL</span>
              <input
                value={baseUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setBaseUrl(next);
                  setProviderPresetId(matchLlmProviderPresetId(next));
                }}
                placeholder="https://api.openai.com/v1"
                readOnly={providerPresetId !== "custom" && Boolean(providerPreset.baseUrl)}
              />
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
              ) : (
                <div className="settings-inline-add">
                  {modelSelectIds.length > 0 &&
                  (providerPresetId !== "custom" ||
                    (modelsFromApi === true && modelOptions.length > 0 && modelOptions.length <= 40)) ? (
                    <select value={model} onChange={(e) => setModel(e.target.value)}>
                      {!model.trim() ? (
                        <option value="" disabled>
                          Please select a model
                        </option>
                      ) : null}
                      {modelSelectIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={model}
                      placeholder="e.g. gpt-4o-mini or openai/gpt-4o-mini"
                      onChange={(e) => setModel(e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className="chrome-approve"
                    disabled={!llmValid || !llmChanged}
                    onClick={() => {
                      preferProviderMode("external");
                      saveLlmAndEnable();
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
              {hasApiKey && modelsFromApi && modelOptions.length > 40 && providerPresetId !== "custom" ? (
                <p className="settings-note">
                  Showing a curated shortlist (this provider returns a large catalog). Switch Provider to
                  Custom to type any model id.
                </p>
              ) : null}
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
          </div>
        ) : (
          <div className="settings-agent-tab-panel" role="tabpanel">
            <SettingsToggle
              checked={llmMode === "local"}
              label="Use Provider"
              onChange={(checked) => {
                if (checked) preferProviderMode("local");
                else if (llmMode === "local") preferProviderMode("external");
              }}
            />
            <p className="settings-note">
              Point Chat at a local or self-hosted model endpoint (OpenAI-compatible).
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Endpoint base URL</span>
              <div className="settings-inline-add">
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={!baseUrl.trim() || !localEndpointChanged}
                  onClick={() => {
                    preferProviderMode("local");
                    saveLlmAndEnable();
                  }}
                >
                  Add
                </button>
              </div>
            </label>
          </div>
        )}

        <section className="settings-section" aria-labelledby="settings-memory-heading">
          <h3 id="settings-memory-heading">Remember from chat</h3>
          <p className="settings-note">
            Optionally save preferences from conversation into your Profile.
          </p>
          <ul className="settings-checkbox-list">
            <li>
              <SettingsToggle
                checked={curatorOn}
                label="Remember preferences from chat (curator)"
                onChange={setCuratorOn}
              />
            </li>
            <li>
              <SettingsToggle
                checked={curatorAutoAcceptOn}
                disabled={!curatorOn}
                label="Apply remembered preferences automatically on your next turn"
                onChange={setCuratorAutoAcceptOn}
              />
            </li>
          </ul>
          <div className="chrome-actions settings-section-actions">
            <button
              type="button"
              className="chrome-approve"
              disabled={!memoryDirty}
              onClick={() => {
                onSaveCurator(curatorOn, curatorAutoAcceptOn);
                markMemoryClean(memoryForm);
              }}
            >
              Save memory settings
            </button>
          </div>
        </section>

        <StandingIntentsPanel vaultUnlocked={vaultUnlocked} embedded />
        <PushSettingsPanel vaultUnlocked={vaultUnlocked} embedded />
        <VoiceSettingsPanel embedded />
      </>
    );
  }

  function renderBriefingPanel() {
    return (
      <BriefingSettingsPanel
        embedded
        deviceLocation={deviceLocation}
        onDeviceLocationChange={onDeviceLocationChange}
      />
    );
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
      <ConnectorsCatalog
        vaultUnlocked={vaultUnlocked}
        onWebcalFeedsChanged={onWebcalFeedsChanged}
        onRssFeedsChanged={onRssFeedsChanged}
      />
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
      <div className="settings-panel payments-settings">
        <SettingsToggle
          checked={agentShopperOn}
          label="Allow Agent Shopping"
          onChange={(next) => {
            setAgentShopperOn(next);
            saveStringToStorage(AGENT_SHOPPER_KEY, String(next));
          }}
        />
        <p className="settings-note">
          When on, your agent may set up a confirmation of interest with a merchant within your
          limits. Payment still happens between you and the merchant (their checkout page). When
          off, the agent can only share product details for you to visit the merchant yourself.
        </p>
        {agentShopperOn ? (
          <SpendPolicySettingsPanel
            workspaceId={activeWorkspaceId}
            vaultUnlocked={vaultUnlocked}
            embedded
          />
        ) : null}
      </div>
    );
  }

  function renderModulesPanel() {
    const indexUrl = productionLocked
      ? PRODUCTION_REGISTRY_URL
      : registryIndexUrl.trim() || registryInitial;
    const inactiveIds = blockedIdsText
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    function saveInactive(nextInactive: string[]) {
      onSaveRegistry(indexUrl, {
        requireIntegrity,
        requireSignature,
        blockedIds: nextInactive,
        trustedPublishers: trustInitial.trustedPublishers,
      });
      setBlockedIdsText(nextInactive.join("\n"));
    }

    function setModuleActive(moduleId: string, active: boolean) {
      if (active) {
        saveInactive(inactiveIds.filter((item) => item !== moduleId));
      } else if (!inactiveIds.includes(moduleId)) {
        saveInactive([...inactiveIds, moduleId]);
      }
    }

    const storeUrl = productionLocked
      ? DEFAULT_APP_STORE_URL
      : appStoreUrl.trim() || DEFAULT_APP_STORE_URL;

    return (
      <div className="modules-settings">
        <p className="settings-panel-desc">
          Add-ons your agent can use. Deactivate to hide from the agent (and Games menu) without
          uninstalling. Browse new modules in the App Store.
        </p>
        <div className="modules-store-link">
          <button
            type="button"
            className="chrome-approve"
            onClick={() => window.open(storeUrl, "_blank", "noopener,noreferrer")}
          >
            Open App Store ↗
          </button>
        </div>
        {moduleCatalogNote ? <p className="settings-note">{moduleCatalogNote}</p> : null}
        <RegistryCatalogList
          indexUrl={indexUrl}
          onStatus={setModuleCatalogNote}
          inactiveIds={inactiveIds}
          onSetModuleActive={productionLocked ? undefined : setModuleActive}
        />

        {revokedModules.length > 0 ? (
          <div className="settings-revocations">
            <h4>Removed by the store</h4>
            <ul className="settings-revocations-list">
              {revokedModules.map((item) => (
                <li key={`${item.id}@${item.version}`}>
                  <code>
                    {item.id}@{item.version}
                  </code>
                  {item.reason ? ` — ${item.reason}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!productionLocked ? (
          <details className="modules-advanced">
            <summary>Advanced registry settings</summary>
            <div className="settings-panel-fields">
              <label className="atom-field">
                <span className="atom-field-label">App Store URL</span>
                <input
                  value={appStoreUrl}
                  onChange={(e) => setAppStoreUrl(e.target.value)}
                  placeholder={DEFAULT_APP_STORE_URL}
                  autoComplete="off"
                />
              </label>
              <label className="atom-field">
                <span className="atom-field-label">Catalog URL</span>
                <input
                  value={registryIndexUrl}
                  onChange={(e) => setRegistryIndexUrl(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <SettingsToggle
                checked={requireIntegrity}
                label="Require integrity checks (recommended)"
                onChange={setRequireIntegrity}
              />
              <SettingsToggle
                checked={requireSignature}
                label="Require signed modules"
                onChange={setRequireSignature}
              />
              <div className="chrome-actions settings-section-actions">
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={!registryIndexUrl.trim() || !advancedRegistryDirty}
                  onClick={() => {
                    saveStringToStorage(
                      APP_STORE_URL_KEY,
                      appStoreUrl.trim() || DEFAULT_APP_STORE_URL,
                    );
                    onSaveRegistry(registryIndexUrl.trim(), {
                      requireIntegrity,
                      requireSignature,
                      blockedIds: inactiveIds,
                      trustedPublishers: trustInitial.trustedPublishers,
                    });
                    markAdvancedRegistryClean({
                      appStoreUrl: appStoreUrl.trim() || DEFAULT_APP_STORE_URL,
                      registryIndexUrl: registryIndexUrl.trim(),
                      requireIntegrity,
                      requireSignature,
                    });
                  }}
                >
                  Save advanced settings
                </button>
              </div>
            </div>
          </details>
        ) : (
          <p className="settings-note">This site uses a fixed, trusted module catalog.</p>
        )}
      </div>
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
      case "profile":
        return profilePanel;
      case "log":
        return logPanel;
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
          {mobileDetailOpen ? (
            <button
              type="button"
              className="settings-heading-back"
              id="settings-dialog-title"
              onClick={() => setMobileDetailOpen(false)}
            >
              <IconChevronRight className="settings-back-icon settings-back-icon--left" />
              Settings
            </button>
          ) : (
            <h2 id="settings-dialog-title">Settings</h2>
          )}
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <div
          className={`settings-dialog-layout${mobileDetailOpen ? " settings-dialog-layout--detail" : " settings-dialog-layout--list"}`}
        >
          <nav className="settings-nav" aria-label="Settings sections">
            {navItems.map((item) => {
              const badge =
                item.id === "profile" && profileBadge
                  ? profileBadge
                  : item.id === "log" && logBadgeCount > 0
                    ? { count: logBadgeCount, tone: "default" as const }
                    : null;
              return (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item${activeSection === item.id ? " is-active" : ""}`}
                aria-current={activeSection === item.id ? "true" : undefined}
                onClick={() => selectSettingsSection(item.id)}
              >
                <span className="settings-nav-label-row">
                  <span className="settings-nav-label">{item.label}</span>
                  {badge ? (
                    <span
                      className={`settings-nav-badge${badge.tone === "warn" ? " settings-nav-badge--warn" : ""}`}
                    >
                      {badge.count}
                    </span>
                  ) : null}
                </span>
                <span className="settings-nav-hint">{item.hint}</span>
                <IconChevronRight className="settings-nav-chevron" />
              </button>
              );
            })}
          </nav>
          <div className="settings-dialog-body">
            {activeSection === "profile" ? (
              profilePanel
            ) : (
              <div className="settings-panel">
                <div className="settings-panel-head">
                  <h3>{activeNav.label}</h3>
                  <p className="settings-panel-desc">{activeNav.hint}</p>
                </div>
                <div className="settings-panel-fields">{renderActivePanel()}</div>
              </div>
            )}
          </div>
        </div>
        <div className="settings-dialog-footer">
          <div className="settings-dialog-footer-end">
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
  const initial: AtomSkinId =
    isAtomSkinId(saved) && saved !== "default" ? saved : "minimal";
  const [skinId, setSkinId] = useState<AtomSkinId>(initial);

  function applySkin(next: AtomSkinId) {
    setSkinId(next);
    applyAtomSkin(next);
    saveStringToStorage(SKIN_STORAGE_KEY, next);
  }

  return (
    <label className="atom-field">
      <span className="atom-field-label">Look</span>
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
