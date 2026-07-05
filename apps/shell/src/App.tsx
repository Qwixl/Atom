import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AttestationLog,
  Catalog,
  ConversationRuntime,
  ModuleRegistry,
  createAttestationPersistence,
  createJsonPersistence,
  loadBooleanFromStorage,
  loadJsonFromStorage,
  loadStringFromStorage,
  registerCorePrimitives,
  saveJsonToStorage,
  saveStringToStorage,
  type AgentSession,
  type AttestationEntry,
  type ConsequentialAction,
  type RegistryRevocation,
  type RegistryTrustPolicy,
  type UiEvent,
} from "@qwixl/shell-core";
import { SurfaceRenderer } from "@qwixl/renderer-web";
import { LlmAgentSession, runCuratorPass, type LlmConfig } from "@qwixl/agent-llm";
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
import { ProfilePanel } from "./ProfilePanel.js";
import { CommsPanel } from "./CommsPanel.js";
import { DiscoverPanel } from "./DiscoverPanel.js";
import { DiscoverChatResults, type DiscoverChatResult } from "./DiscoverChatResults.js";
import { connectDiscoverEntry, joinDiscoverRoom } from "./discoverActions.js";
import { extractDiscoverTerms, isDiscoverQuery } from "./discoverQuery.js";
import { loadDiscoverIndexes } from "./discoverIndexStorage.js";
import { RoomsPanel } from "./RoomsPanel.js";
import { FirstRunWizard } from "./FirstRunWizard.js";
import { loadFirstRunDone, markFirstRunDone, resetFirstRunDone } from "./firstRunStorage.js";
import { DemoBootstrap } from "./DemoBootstrap.js";
import { PersonalDemoWalkthrough } from "./PersonalDemoWalkthrough.js";
import { buildGoogleCalendarAddUrl } from "./calendarAddLink.js";
import { type DemoCalendarEvent } from "./demoScheduling.js";
import { CommsAgentClient } from "./comms/client.js";
import { syncContactsToAgent } from "./comms/contactSync.js";
import {
  applyDemoPersona,
  loadDemoPersona,
  IS_DEMO_MODE,
} from "./demoPersonas.js";
import { CustodySecurityPanel } from "./custody/CustodySecurityPanel.js";
import { WebCalSettingsPanel } from "./connectors/WebCalSettingsPanel.js";
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
import { isVaultInitialized, isVaultUnlocked } from "./custody/dataVault.js";
import { VaultUnlockGate } from "./custody/VaultUnlockGate.js";
import { RegistryCatalogList } from "./RegistryCatalogList.js";
import { loadContacts } from "./comms/storage.js";
import type { AgentContact } from "./comms/types.js";
import {
  ALLOW_BROWSER_LLM,
  ATOM_BROWSER_MODE,
  IS_PRODUCTION_HOST,
  MANAGED_HOSTING,
  PRODUCTION_REGISTRY_TRUST,
  PRODUCTION_REGISTRY_URL,
  SHOW_DEV_WORKFLOWS,
} from "./hostConfig.js";
import { applyAtomSkin, ATOM_SKINS, type AtomSkinId } from "@qwixl/skin-default/tokens";
import { ShellComposer } from "./shell/ShellComposer.js";
import { ConfirmationChrome } from "./shell/ConfirmationChrome.js";
import { ShellMainHeader } from "./shell/ShellMainHeader.js";
import { ShellSidebar, type ShellNavPanel } from "./shell/ShellSidebar.js";

type Provider = "mock" | "llm" | "ag-ui";
type SidePanel = ShellNavPanel;

type ShellSession = AgentSession & { dispose?: () => void };

const SUGGESTIONS = [
  "Find a coffee shop",
  "Schedule a team standup next week",
  "RSVP to the design review",
  "What time works for our standup?",
];
const AGUI_CONFIG_KEY = "atom-agui-config";
const REGISTRY_URL_KEY = "atom-registry-url";
const REGISTRY_TRUST_KEY = "atom-registry-trust";
const CURATOR_ENABLED_KEY = "atom-curator-enabled";
const CURATOR_AUTO_ACCEPT_KEY = "atom-curator-auto-accept-open";
const SKIN_STORAGE_KEY = "atom-shell-skin";
const PROVIDER_KEY = "atom-provider";
const DEFAULT_AGUI_URL = "http://localhost:5201/agent";
const DEFAULT_REGISTRY_URL = "/registry/index.json";
const REVOCATION_REFRESH_MS = 5 * 60 * 1000;

function loadAgUiConfig(): AgUiAgentConfig {
  const parsed = loadJsonFromStorage<{ url?: string }>(AGUI_CONFIG_KEY);
  if (parsed?.url?.trim()) return { url: parsed.url.trim() };
  if (IS_PRODUCTION_HOST) return { url: "" };
  return { url: DEFAULT_AGUI_URL };
}

function loadRegistryUrl(): string {
  if (IS_PRODUCTION_HOST) return PRODUCTION_REGISTRY_URL;
  return loadStringFromStorage(REGISTRY_URL_KEY)?.trim() || DEFAULT_REGISTRY_URL;
}

function loadRegistryTrust(): RegistryTrustPolicy {
  if (IS_PRODUCTION_HOST) return PRODUCTION_REGISTRY_TRUST;
  const parsed = loadJsonFromStorage<RegistryTrustPolicy>(REGISTRY_TRUST_KEY);
  if (!parsed) return { requireIntegrity: true };
  return {
    requireIntegrity: parsed.requireIntegrity !== false,
    requireSignature: parsed.requireSignature === true,
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
const ownerRecordsPersistence = createJsonPersistence<OwnerRecord[]>({
  key: "atom-owner-store",
  validate: (value): value is OwnerRecord[] => Array.isArray(value),
});
const ownerProposalsPersistence = createJsonPersistence<RecordProposal[]>({
  key: "atom-owner-proposals",
  validate: (value): value is RecordProposal[] => Array.isArray(value),
});
const conversationMemoryPersistence = createJsonPersistence<MemoryChunk[]>({
  key: "atom-conversation-memory",
  validate: (value): value is MemoryChunk[] => Array.isArray(value),
});

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
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

  const [firstRunOpen, setFirstRunOpen] = useState(false);
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
      const finishConnected = () => {
        setAgentConnectionReady(true);
        markFirstRunDone();
        setFirstRunOpen(false);
        if (isVaultInitialized() && !isVaultUnlocked()) {
          setVaultUnlocked(false);
        }
      };

      if ((await reconcileAgentConnection()) === "ok") {
        await refreshCommsConfigCache();
        finishConnected();
        setAgentBootstrapPending(false);
        return;
      }

      if (ATOM_BROWSER_MODE) {
        const browserConfig = loadBrowserAgentConfig();
        if (browserConfig) {
          await saveCommsAgentConfigSecure(browserConfig);
          if ((await probeAgentConnection(browserConfig)) === "ok") {
            await refreshCommsConfigCache();
            finishConnected();
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
        setFirstRunOpen(true);
        setAgentBootstrapPending(false);
        return;
      }

      if (stored.adminToken?.trim()) {
        const status = await probeAgentConnection(stored);
        if (status === "ok") {
          await refreshCommsConfigCache();
          finishConnected();
          setAgentBootstrapPending(false);
          return;
        }
      }

      // Local dev: never block the shell with a signup wizard. Configure once in Comms → Setup.
      if (SHOW_DEV_WORKFLOWS) {
        markFirstRunDone();
        setFirstRunOpen(false);
        setAgentConnectionReady(false);
        setAgentBootstrapPending(false);
        return;
      }

      // Production: hosted signup when nothing is connected yet.
      setAgentConnectionReady(false);
      setFirstRunOpen(true);
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
    setFirstRunOpen(true);
  }, []);

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
          setFirstRunOpen(true);
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
    return resolveLlmConfig(llmConnection, secretStore);
  }, [llmConnection, secretStore]);
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [roomsFocusId, setRoomsFocusId] = useState<string | null>(null);
  const [commsFocusId, setCommsFocusId] = useState<string | null>(null);
  const [chatDiscoverResults, setChatDiscoverResults] = useState<DiscoverChatResult[] | null>(null);
  const [discoverActionBusy, setDiscoverActionBusy] = useState(false);
  const [commsContacts, setCommsContacts] = useState<AgentContact[]>(() =>
    loadContacts(ownerRecordsPersistence.load()),
  );

  useEffect(() => {
    if (IS_DEMO_MODE || !agentConnectionReady) return;
    const config = loadCommsAgentConfig();
    if (!config.adminToken?.trim()) return;
    const client = new CommsAgentClient(config.adminUrl, config.adminToken);
    void syncContactsToAgent(client, commsContacts).catch(() => {
      /* policy sync is best-effort until agent is reachable */
    });
  }, [commsContacts, agentConnectionReady]);

  const [profileRecords, setProfileRecords] = useState<OwnerRecord[]>(ownerStore.list());
  const [profileProposals, setProfileProposals] = useState<RecordProposal[]>(
    ownerStore.listProposals(),
  );
  const [curatorEnabled, setCuratorEnabled] = useState(() => loadCuratorEnabled());
  const [curatorAutoAcceptOpen, setCuratorAutoAcceptOpen] = useState(() =>
    loadCuratorAutoAcceptOpen(),
  );
  const [modulesEnabled, setModulesEnabled] = useState(true);
  const [registryUrl, setRegistryUrl] = useState(() => loadRegistryUrl());
  const [registryTrust, setRegistryTrust] = useState(() => loadRegistryTrust());
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [revokedModules, setRevokedModules] = useState<readonly RegistryRevocation[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const turnTranscript = useRef<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const lastUserMessageRef = useRef("");
  const sessionContextTagsRef = useRef<string[]>([]);

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
    () =>
      mergeBusinessContextIntoProfile(
        ownerStore,
        buildPersonalAgentContext(ownerStore, conversationMemory, lastUserMessageRef.current, {
          sessionContextTags: sessionContextTagsRef.current,
        }),
      ),
    [ownerStore, conversationMemory],
  );

  const registry = useMemo(
    () => new ModuleRegistry({ indexUrl: registryUrl, trust: registryTrust }),
    [registryUrl, registryTrust],
  );

  const loadDemoWebcalEvents = useCallback(async (): Promise<DemoCalendarEvent[]> => {
    const config = loadCommsAgentConfig();
    const client = new CommsAgentClient(config.adminUrl, config.adminToken);
    const status = await client.invokeConnector("webcal", "getStatus", {});
    const connected = Boolean((status.result as { connected?: boolean }).connected);
    if (!connected) return [];
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const listed = await client.invokeConnector("webcal", "listEvents", {
      timeMin: now.toISOString(),
      timeMax: twoWeeks.toISOString(),
    });
    return (listed.result as { events?: DemoCalendarEvent[] }).events ?? [];
  }, []);

  const refreshDemoWebcalState = useCallback(async () => {
    try {
      const statusResult = await (async () => {
        const config = loadCommsAgentConfig();
        const client = new CommsAgentClient(config.adminUrl, config.adminToken);
        return client.invokeConnector("webcal", "getStatus", {});
      })();
      const connected = Boolean((statusResult.result as { connected?: boolean }).connected);
      setDemoWebcalReady(connected);
      if (!connected) {
        setDemoCalendarEvents([]);
        return;
      }
      const events = await loadDemoWebcalEvents();
      setDemoCalendarEvents(events);
    } catch {
      setDemoWebcalReady(false);
      setDemoCalendarEvents([]);
    }
  }, [loadDemoWebcalEvents]);

  useEffect(() => {
    if (!IS_DEMO_MODE) return;
    applyDemoPersona(loadDemoPersona());
  }, []);

  useEffect(() => {
    if (!IS_DEMO_MODE || !demoReady) return;
    void refreshDemoWebcalState();
    const timer = window.setInterval(() => void refreshDemoWebcalState(), 4000);
    return () => window.clearInterval(timer);
  }, [demoReady, refreshDemoWebcalState]);

  useEffect(() => {
    if (!modulesEnabled) {
      registry.uninstallAll(catalog);
    }
  }, [modulesEnabled, catalog, registry]);

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
    if (!modulesEnabled) return;
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
  }, [modulesEnabled, registry, catalog, registryUrl]);

  /** Promote persisted non-guarded curator proposals into open profile records. */
  useEffect(() => {
    if (!curatorAutoAcceptOpen) return;
    const accepted = ownerStore.acceptOpenProposals();
    if (accepted > 0) {
      setProfileRecords(ownerStore.list());
      setProfileProposals(ownerStore.listProposals());
    }
  }, [ownerStore, curatorAutoAcceptOpen]);

  const session: ShellSession = useMemo(() => {
    if (provider === "llm" && llmConfig) {
      // Live provider: the slice is reassembled from the store on every
      // model call, so guarding/unguarding a record applies from the
      // agent's next turn (earlier transcript influence remains).
      return new LlmAgentSession(llmConfig, catalog, buildContext);
    }
    if (provider === "ag-ui") {
      return new AgUiAgentSession({
        ...agUiConfig,
        profileProvider: buildContext,
      });
    }
    return new MockAgentSession({
      profileProvider: buildContext,
      webcalEventsProvider: IS_DEMO_MODE && demoWebcalReady ? loadDemoWebcalEvents : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, llmConfig, agUiConfig, catalog, ownerStore, conversationMemory, buildContext, demoWebcalReady, loadDemoWebcalEvents]);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const prevSessionRef = useRef<ShellSession | null>(null);

  const modulesEnabledRef = useRef(modulesEnabled);
  modulesEnabledRef.current = modulesEnabled;
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

  const conversation = useMemo(
    () =>
      new ConversationRuntime({
        catalog,
        beforeResolveComposition: async (composition) => {
          if (!modulesEnabledRef.current) return;
          setRegistryErrorRef.current(null);
          await registryRef.current.ensureModules(catalogRef.current, composition);
        },
        onRegistryError: (message) => setRegistryErrorRef.current(message),
        guardedRecordCount: (categories) =>
          ownerStoreRef.current.guardedRecords(categories).length,
        onTranscriptLine: (role, text) => {
          if (role === "user") lastUserMessageRef.current = text;
          turnTranscript.current.push({ role, text });
        },
        onTurnComplete: () => {
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

  const { feed, busy, pending } = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.getSnapshot(),
  );

  useEffect(() => {
    if (prevSessionRef.current && prevSessionRef.current !== session) {
      prevSessionRef.current.dispose?.();
      conversationRef.current.setBusy(false);
    }
    prevSessionRef.current = session;
  }, [session]);

  useEffect(() => conversation.wireSession(session), [session, conversation]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed, busy]);

  function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (provider === "llm" && !llmConfig) {
      conversationRef.current.appendUserAndAgentText(
        trimmed,
        "Live LLM is selected but no API key is configured. Open Settings to add your key.",
      );
      return;
    }
    if (
      !IS_DEMO_MODE &&
      panel === "none" &&
      agentConnectionReady &&
      isDiscoverQuery(trimmed)
    ) {
      turnTranscript.current = [];
      conversationRef.current.appendUser(trimmed);
      setInput("");
      setChatDiscoverResults(null);
      conversationRef.current.setBusy(true);
      void (async () => {
        try {
          const config = loadCommsAgentConfig();
          const client = new CommsAgentClient(config.adminUrl, config.adminToken);
          const { summary, results } = await client.discoverSearch({
            terms: extractDiscoverTerms(trimmed),
            indexBaseUrl: window.location.origin,
            indexes: loadDiscoverIndexes(),
          });
          conversationRef.current.appendLocalAgentText(summary);
          setChatDiscoverResults(results);
        } catch (error) {
          conversationRef.current.appendLocalAgentText(
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          conversationRef.current.setBusy(false);
        }
      })();
      return;
    }
    turnTranscript.current = [];
    conversationRef.current.appendUser(trimmed);
    setInput("");
    sessionRef.current.sendUserMessage(trimmed);
  }

  async function handleChatDiscoverDm(result: DiscoverChatResult): Promise<void> {
    setDiscoverActionBusy(true);
    try {
      const config = loadCommsAgentConfig();
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      const { contact, contacts } = await connectDiscoverEntry({
        client,
        entry: { ...result.entry, resolved: result.resolved },
        contacts: commsContacts,
      });
      setCommsContacts(contacts);
      setCommsFocusId(contact.id);
      setChatDiscoverResults(null);
      setPanel("comms");
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setDiscoverActionBusy(false);
    }
  }

  async function handleChatDiscoverJoin(result: DiscoverChatResult): Promise<void> {
    setDiscoverActionBusy(true);
    try {
      const config = loadCommsAgentConfig();
      const client = new CommsAgentClient(config.adminUrl, config.adminToken);
      const roomId = await joinDiscoverRoom({
        client,
        entry: { ...result.entry, resolved: result.resolved },
      });
      setRoomsFocusId(roomId);
      setChatDiscoverResults(null);
      setPanel("rooms");
    } catch (error) {
      conversationRef.current.appendLocalAgentText(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setDiscoverActionBusy(false);
    }
  }

  function handleUiEvent(event: UiEvent) {
    if (recordUiPreferenceFeedback(ownerStore, event) > 0) {
      setProfileRecords(ownerStore.list());
    }
    conversationRef.current.setBusy(true);
    sessionRef.current.sendUiEvent(event);
  }

  async function decide(decision: "approved" | "declined") {
    if (!pending) return;
    if (decision === "approved") {
      setCustodyError(null);
      try {
        await requireCustodyApproval(pending.action);
      } catch (error) {
        setCustodyError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
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
    if (
      IS_DEMO_MODE &&
      decision === "approved" &&
      typeof pending.action.terms.start === "string" &&
      typeof pending.action.terms.end === "string"
    ) {
      const url = buildGoogleCalendarAddUrl({
        title: String(pending.action.terms.event ?? pending.action.title),
        start: pending.action.terms.start,
        end: pending.action.terms.end,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      setDemoCalendarAdded(true);
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
        const custody = await requireCustodyApproval(activeAction);
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
    const client = new CommsAgentClient(config.adminUrl, config.adminToken);
    await client.addWebcalFeed(url);
    await refreshDemoWebcalState();
  }

  function sendDemoScheduleMessage(text: string) {
    setDemoScheduleSent(true);
    submitMessage(text);
  }

  return (
    <div className={`shell${IS_DEMO_MODE ? " shell--demo" : ""}`}>
      <div className="shell-frame">
        {!IS_DEMO_MODE ? (
          <ShellSidebar
            panel={panel}
            onNavigate={navigatePanel}
            onOpenSettings={() => {
              setSettingsIntent(null);
              setSettingsOpen(true);
            }}
            commsCount={commsContacts.length}
            profileBadge={profileNavBadge}
            logCount={attestations.length}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
        ) : null}

        <div className="shell-main">
          {!IS_DEMO_MODE ? (
            <ShellMainHeader
              panel={panel}
              ownerAgentSummary={ownerAgentSummary}
              vaultUnlocked={vaultUnlocked}
              registryError={registryError}
              modulesEnabled={modulesEnabled}
              onToggleModules={() => setModulesEnabled((current) => !current)}
              provider={provider}
              onSwitchProvider={switchProvider}
              allowBrowserLlm={ALLOW_BROWSER_LLM}
              settingsIntent={settingsIntent}
              onOpenMobileNav={() => setMobileNavOpen(true)}
              showChatProviderControls={panel === "none"}
            />
          ) : (
            <header className="shell-main-header">
              <div className="shell-main-header-start">
                <div className="shell-main-header-titles">
                  <h1 className="shell-main-header-title">Atom</h1>
                  <p className="shell-main-header-subtitle">Personal demo</p>
                </div>
              </div>
            </header>
          )}

          <div
            className={`shell-main-body${
              !IS_DEMO_MODE && (panel === "comms" || panel === "discover" || panel === "rooms")
                ? " shell-main-body--comms"
                : ""
            }${IS_DEMO_MODE && demoReady ? " shell-main-body--personal-demo" : ""}`}
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
                  Live agent: composes unscripted from the catalog vocabulary. It has no live data
                  integrations yet, so content is illustrative.
                </p>
              ) : null}
              {provider === "ag-ui" ? (
                <p className="shell-empty-note">
                  AG-UI transport: connects to an agent backend over SSE. Start the reference server
                  with <code>pnpm dev:ag-ui</code> (default {DEFAULT_AGUI_URL}).
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
                  <div key={item.id} className="feed-agent">
                    {item.text}
                  </div>
                );
              }
              return (
                <div key={item.id} className="feed-surface">
                  {item.surface.degraded ? (
                    <div className="feed-surface-degraded">degraded rendering</div>
                  ) : null}
                  <SurfaceRenderer surface={item.surface} onEvent={handleUiEvent} />
                </div>
              );
            })
          )}
          {chatDiscoverResults && chatDiscoverResults.length > 0 ? (
            <div className="feed-discover-bundle">
              <DiscoverChatResults
                results={chatDiscoverResults}
                busy={discoverActionBusy || busy}
                onDm={(result) => void handleChatDiscoverDm(result)}
                onJoinRoom={(result) => void handleChatDiscoverJoin(result)}
                onOpenDiscover={() => {
                  setChatDiscoverResults(null);
                  setPanel("discover");
                }}
              />
            </div>
          ) : null}
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
              setFirstRunOpen(true);
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
              setFirstRunOpen(true);
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
              setFirstRunOpen(true);
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
            onChanged={() => {
              setProfileRecords(ownerStore.list());
              setProfileProposals(ownerStore.listProposals());
            }}
          />
          </div>
        ) : null}

        {panel === "log" ? (
          <div className="panel-view shell-panel-view">
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
        ) : null}
          </div>

          {showMainComposer ? (
            <ShellComposer
              value={input}
              busy={busy}
              onChange={setInput}
              onSubmit={submitMessage}
            />
          ) : null}
        </div>
      </div>

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
              : "Approving requires your passkey (biometric or PIN). This decision is recorded in your attestation log."
          }
          error={custodyError}
          onDecline={() => void decideChrome("declined")}
          onApprove={() => void decideChrome("approved")}
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

      {!IS_DEMO_MODE && !firstRunOpen && agentConnectionReady && !vaultUnlocked ? (
        <VaultUnlockGate
          onUnlocked={() => {
            void refreshCommsConfigCache().then(() => setVaultUnlocked(true));
          }}
        />
      ) : null}

      {!IS_DEMO_MODE && firstRunOpen && !ATOM_BROWSER_MODE && !SHOW_DEV_WORKFLOWS ? (
        <FirstRunWizard
          onDone={() => {
            void refreshCommsConfigCache().then(() => {
              setFirstRunOpen(false);
              setAgentConnectionReady(true);
              if (!isVaultInitialized()) setVaultUnlocked(true);
            });
          }}
          onOpenComms={() => {
            setPanel("comms");
            setFirstRunOpen(false);
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
        />
      ) : null}
    </div>
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
  onClose,
  onSaveLlm,
  onSaveStripePayment,
  onSaveAgUi,
  onSaveRegistry,
  onSaveCurator,
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
  onClose: () => void;
  onSaveLlm: (connection: LlmConnectionConfig, apiKey?: string) => void;
  onSaveStripePayment: (connection: PaymentConnectionConfig, secretKey?: string) => void;
  onSaveAgUi: (config: AgUiAgentConfig) => void;
  onSaveRegistry: (url: string, trust: RegistryTrustPolicy) => void;
  onSaveCurator: (enabled: boolean, autoAcceptOpen: boolean) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(
    llmConnectionInitial?.baseUrl ?? "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(llmConnectionInitial?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [changingKey, setChangingKey] = useState(!savedLlmKeyHint);
  const [agUiUrl, setAgUiUrl] = useState(agUiInitial.url);
  const [registryIndexUrl, setRegistryIndexUrl] = useState(registryInitial);
  const [requireIntegrity, setRequireIntegrity] = useState(trustInitial.requireIntegrity !== false);
  const [requireSignature, setRequireSignature] = useState(trustInitial.requireSignature === true);
  const [curatorOn, setCuratorOn] = useState(curatorInitial);
  const [curatorAutoAcceptOn, setCuratorAutoAcceptOn] = useState(curatorAutoAcceptInitial);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [changingStripeSecret, setChangingStripeSecret] = useState(!savedStripeSecretHint);
  const [stripePublishableKey, setStripePublishableKey] = useState(
    stripePaymentInitial?.publishableKey ?? "",
  );
  const [stripeProductId, setStripeProductId] = useState(stripePaymentInitial?.productId ?? "");
  const hasSavedKey = Boolean(savedLlmKeyHint) && !changingKey;
  const llmValid =
    Boolean(baseUrl.trim() && model.trim()) &&
    (hasSavedKey || Boolean(apiKey.trim()));
  const hasSavedStripeSecret = Boolean(savedStripeSecretHint) && !changingStripeSecret;
  const stripePaymentValid =
    (hasSavedStripeSecret || Boolean(stripeSecretKey.trim())) &&
    Boolean(stripePublishableKey.trim());
  const agUiValid = agUiUrl.trim().length > 0;

  function saveLlmAndEnable() {
    onSaveCurator(curatorOn, curatorAutoAcceptOn);
    const connection: LlmConnectionConfig = {
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      secretRef: llmConnectionInitial?.secretRef ?? DEFAULT_LLM_SECRET_REF,
    };
    onSaveLlm(connection, hasSavedKey ? undefined : apiKey.trim());
  }

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

  return (
    <div
      className="chrome-overlay settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      onClick={onClose}
    >
      <div className="settings-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title">Agent connection</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <div className="settings-dialog-body">
        {intent === "llm" ? (
          <p className="settings-intent-note">
            Enter your model endpoint and API key, then click <strong>Enable Live LLM</strong> below.
          </p>
        ) : null}
        <section className="settings-section settings-section-first">
          <h3>Chat agent</h3>
          {productionLocked ? (
            <p className="settings-note">
              On this site, chat runs through a server-side agent — your API keys never enter the
              browser. Set the agent URL below, or use the Composer tab for scripted demos.
            </p>
          ) : (
            <>
          <h3>Live LLM</h3>
          <p className="settings-note">
            OpenAI-compatible chat endpoint. Keys are stored in memory for this session only (local
            dev). For production embedders, use AG-UI or inject a host SecretStore.
          </p>
          <label className="atom-field">
            <span className="atom-field-label">Endpoint base URL</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Model</span>
            <input
              value={model}
              placeholder="e.g. gpt-4o-mini"
              onChange={(e) => setModel(e.target.value)}
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
            </>
          )}
          {!productionLocked ? (
            <>
          <label className="atom-field atom-field-checkbox">
            <input type="checkbox" checked={curatorOn} onChange={(e) => setCuratorOn(e.target.checked)} />
            <span>Remember preferences from chat (curator)</span>
          </label>
          <label className="atom-field atom-field-checkbox">
            <input
              type="checkbox"
              checked={curatorAutoAcceptOn}
              disabled={!curatorOn}
              onChange={(e) => setCuratorAutoAcceptOn(e.target.checked)}
            />
            <span>Apply remembered preferences automatically on your next turn</span>
          </label>
            </>
          ) : null}
          {productionLocked ? (
            <>
              <label className="atom-field">
                <span className="atom-field-label">Chat agent URL</span>
                <input
                  value={agUiUrl}
                  onChange={(e) => setAgUiUrl(e.target.value)}
                  placeholder="https://your-agent.example.com/agent"
                />
              </label>
              <div className="chrome-actions settings-section-actions">
                <button
                  className="chrome-approve"
                  disabled={!agUiValid}
                  onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
                >
                  Save chat agent
                </button>
              </div>
            </>
          ) : null}
        </section>
        <CustodySecurityPanel />
        <WebCalSettingsPanel vaultUnlocked={vaultUnlocked} />
        {!productionLocked ? (
        <section className="settings-section">
          <h3>Payments</h3>
          <p className="settings-note">
            Optional Stripe keys for paid modules and commerce holds. Keys stay on your agent, not
            in the browser.
          </p>
          {hasSavedStripeSecret ? (
            <div className="settings-saved-key">
              <span className="settings-saved-key-label">Secret key</span>
              <span className="settings-saved-key-value">
                Using saved key ({savedStripeSecretHint})
              </span>
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
        </section>
        ) : null}
        {!productionLocked ? (
        <section className="settings-section">
          <h3>AG-UI backend</h3>
          <p className="settings-note">
            URL of a server-side chat agent (local dev default: {DEFAULT_AGUI_URL}).
          </p>
          <label className="atom-field">
            <span className="atom-field-label">Agent URL</span>
            <input value={agUiUrl} onChange={(e) => setAgUiUrl(e.target.value)} />
          </label>
          <div className="chrome-actions settings-section-actions">
            <button
              className="chrome-approve"
              disabled={!agUiValid}
              onClick={() => onSaveAgUi({ url: agUiUrl.trim() })}
            >
              Use AG-UI
            </button>
          </div>
        </section>
        ) : null}
        <section className="settings-section">
          <h3>Appearance</h3>
          {!productionLocked ? (
          <p className="settings-note">
            Choose a color theme for the shell.
          </p>
          ) : null}
          <SkinPicker />
        </section>
        {!productionLocked ? (
        <section className="settings-section">
          <h3>Module registry</h3>
          <p className="settings-note">
            URL of the module catalog your shell loads modules from.
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
          <div className="chrome-actions settings-section-actions">
            <button
              className="chrome-approve"
              disabled={!registryIndexUrl.trim()}
              onClick={() =>
                onSaveRegistry(registryIndexUrl.trim(), { requireIntegrity, requireSignature })
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
            <RegistryCatalogList indexUrl={registryIndexUrl.trim() || registryInitial} />
          </div>
        </section>
        ) : (
        <section className="settings-section">
          <h3>Modules</h3>
          <p className="settings-note">Browse modules from the trusted catalog for this site.</p>
          <RegistryCatalogList indexUrl={PRODUCTION_REGISTRY_URL} />
        </section>
        )}
        </div>
        <div className="settings-dialog-footer">
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SkinPicker() {
  const saved = loadStringFromStorage(SKIN_STORAGE_KEY);
  const initial: AtomSkinId =
    saved === "dark" || saved === "high-contrast" || saved === "default" ? saved : "default";
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
