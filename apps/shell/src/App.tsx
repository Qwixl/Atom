import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  type OwnerRecord,
  type RecordProposal,
  recordUiPreferenceFeedback,
} from "@qwixl/owner-store";
import {
  createDefaultSecretStore,
  DEFAULT_LLM_SECRET_REF,
  isLlmConnectionReady,
  loadAndMigrateLlmConnection,
  maskSecret,
  persistLlmConnection,
  resolveLlmConfig,
  type LlmConnectionConfig,
  type SecretStore,
} from "@qwixl/secret-store";
import { MockAgentSession } from "./mock-agent.js";
import { ProfilePanel } from "./ProfilePanel.js";

type Provider = "mock" | "llm" | "ag-ui";
type SidePanel = "none" | "log" | "profile";

type ShellSession = AgentSession & { dispose?: () => void };

const SUGGESTIONS = [
  "Schedule a team standup next week",
  "RSVP to the design review",
  "What time works for our standup?",
  "Show me my spending this quarter",
];
const AGUI_CONFIG_KEY = "atom-agui-config";
const REGISTRY_URL_KEY = "atom-registry-url";
const REGISTRY_TRUST_KEY = "atom-registry-trust";
const CURATOR_ENABLED_KEY = "atom-curator-enabled";
const CURATOR_AUTO_ACCEPT_KEY = "atom-curator-auto-accept-open";
const PROVIDER_KEY = "atom-provider";
const DEFAULT_AGUI_URL = "http://localhost:5201/agent";
const DEFAULT_REGISTRY_URL = "/registry/index.json";
const REVOCATION_REFRESH_MS = 5 * 60 * 1000;

function loadAgUiConfig(): AgUiAgentConfig {
  const parsed = loadJsonFromStorage<{ url?: string }>(AGUI_CONFIG_KEY);
  if (parsed?.url?.trim()) return { url: parsed.url.trim() };
  return { url: DEFAULT_AGUI_URL };
}

function loadRegistryUrl(): string {
  return loadStringFromStorage(REGISTRY_URL_KEY)?.trim() || DEFAULT_REGISTRY_URL;
}

function loadRegistryTrust(): RegistryTrustPolicy {
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
  return loadBooleanFromStorage(CURATOR_AUTO_ACCEPT_KEY, true);
}

function loadSavedProvider(store: SecretStore): Provider {
  try {
    const saved = loadStringFromStorage(PROVIDER_KEY);
    if (saved === "llm" && isLlmConnectionReady(loadAndMigrateLlmConnection(store), store)) {
      return "llm";
    }
    if (saved === "ag-ui") return "ag-ui";
  } catch {
    // fall through
  }
  return "mock";
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

export function App() {
  const catalog = useMemo(() => {
    const c = new Catalog();
    registerCorePrimitives(c);
    return c;
  }, []);

  const attestationLog = useMemo(
    () =>
      new AttestationLog({
        persist: (entries) => attestationPersistence.save([...entries]),
        restore: attestationPersistence.load() as AttestationEntry[] | undefined,
      }),
    [],
  );

  const ownerStore = useMemo(
    () =>
      new OwnerStore({
        persist: (records) => ownerRecordsPersistence.save([...records]),
        restore: ownerRecordsPersistence.load(),
        persistProposals: (proposals) => ownerProposalsPersistence.save([...proposals]),
        restoreProposals: ownerProposalsPersistence.load(),
      }),
    [],
  );

  const secretStore = useMemo(() => createDefaultSecretStore(), []);

  const [provider, setProvider] = useState<Provider>(() => loadSavedProvider(secretStore));
  const [llmConnection, setLlmConnection] = useState<LlmConnectionConfig | null>(() =>
    loadAndMigrateLlmConnection(secretStore),
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
  const [agUiConfig, setAgUiConfig] = useState<AgUiAgentConfig>(() => loadAgUiConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Set when user picks a provider that needs configuration first. */
  const [settingsIntent, setSettingsIntent] = useState<Provider | null>(null);
  const [input, setInput] = useState("");
  const [attestations, setAttestations] = useState<readonly AttestationEntry[]>(
    attestationLog.list(),
  );
  const [panel, setPanel] = useState<SidePanel>("none");
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

  const registry = useMemo(
    () => new ModuleRegistry({ indexUrl: registryUrl, trust: registryTrust }),
    [registryUrl, registryTrust],
  );

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
      return new LlmAgentSession(llmConfig, catalog, () => ownerStore.contextSlice());
    }
    if (provider === "ag-ui") {
      return new AgUiAgentSession(agUiConfig);
    }
    return new MockAgentSession({
      profileProvider: () => ownerStore.contextSlice(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, llmConfig, agUiConfig, catalog, ownerStore]);

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
          turnTranscript.current.push({ role, text });
        },
        onTurnComplete: () => {
          const activeProvider = providerRef.current;
          const activeLlmConfig = llmConfigRef.current;
          const activeOwnerStore = ownerStoreRef.current;
          if (activeProvider !== "llm" || !activeLlmConfig || !curatorEnabledRef.current) {
            return;
          }
          const transcript = turnTranscript.current;
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
              };
            }),
          })
            .then((result) => {
              if (result.signals.length > 0) {
                activeOwnerStore.applyCuratorSignals(result.signals);
              }
              if (result.proposals.length === 0 && result.signals.length === 0) return;
              for (const proposal of result.proposals) {
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
    turnTranscript.current = [];
    conversationRef.current.appendUser(trimmed);
    setInput("");
    sessionRef.current.sendUserMessage(trimmed);
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
    const entry = await attestationLog.append({
      surfaceId: pending.surfaceId,
      action: pending.action,
      decision,
    });
    setAttestations([...attestationLog.list()]);
    const { dataRequest } = pending;
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

  function switchProvider(next: Provider) {
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

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsIntent(null);
  }

  return (
    <div className="shell">
      <header className="shell-titlebar">
        <div className="shell-brand">
          <span className="shell-brand-mark" />
          Atom Shell
          <span className="shell-brand-tag">
            v1 ·{" "}
            {provider === "mock"
              ? "mock agent"
              : provider === "ag-ui"
                ? `ag-ui · ${agUiConfig.url.replace(/^https?:\/\//, "")}`
                : `live agent · ${llmConfig?.model}`}
            {modulesEnabled ? ` · registry · ${registry.installedModuleIds().length} installed` : ""}
          </span>
        </div>
        {registryError ? (
          <span className="shell-brand-tag shell-registry-error" title={registryError}>
            {registryError.startsWith("Revoked") ? "revoked" : "registry error"}
          </span>
        ) : null}
        <div className="shell-titlebar-actions">
          <div className="shell-provider">
            <button
              className={provider === "mock" ? "active" : ""}
              onClick={() => switchProvider("mock")}
            >
              Mock
            </button>
            <button
              className={provider === "llm" || settingsIntent === "llm" ? "active" : ""}
              onClick={() => switchProvider("llm")}
            >
              Live LLM
            </button>
            <button
              className={provider === "ag-ui" || settingsIntent === "ag-ui" ? "active" : ""}
              onClick={() => switchProvider("ag-ui")}
            >
              AG-UI
            </button>
          </div>
          <button
            className={`shell-log-toggle${modulesEnabled ? " active" : ""}`}
            onClick={() => setModulesEnabled((current) => !current)}
            title="Toggle module registry (off → resolver fallback for community refs)"
          >
            Modules {modulesEnabled ? "on" : "off"}
          </button>
          <button className="shell-log-toggle" onClick={() => { setSettingsIntent(null); setSettingsOpen(true); }}>
            Settings
          </button>
          <button
            className="shell-log-toggle"
            onClick={() => setPanel((current) => (current === "profile" ? "none" : "profile"))}
          >
            Profile
            {profileProposals.length > 0 ? (
              <span className="shell-log-count shell-log-count-proposal">{profileProposals.length}</span>
            ) : profileRecords.length > 0 ? (
              <span className="shell-log-count">{profileRecords.length}</span>
            ) : null}
          </button>
          <button
            className="shell-log-toggle"
            onClick={() => setPanel((current) => (current === "log" ? "none" : "log"))}
          >
            Attestation log
            {attestations.length > 0 ? (
              <span className="shell-log-count">{attestations.length}</span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="shell-body">
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
          {busy ? <div className="feed-busy">agent working…</div> : null}
        </main>

        {panel === "profile" ? (
          <ProfilePanel
            store={ownerStore}
            records={profileRecords}
            proposals={profileProposals}
            onChanged={() => {
              setProfileRecords(ownerStore.list());
              setProfileProposals(ownerStore.listProposals());
            }}
          />
        ) : null}

        {panel === "log" ? (
          <aside className="shell-attestations">
            <h2>Attestation log</h2>
            <p className="shell-attestations-note">
              Append-only, hash-chained record of every consequential decision and the exact terms
              displayed when you made it.
            </p>
            {attestations.length === 0 ? (
              <p className="shell-attestations-empty">No decisions recorded yet.</p>
            ) : (
              attestations.map((entry) => (
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
              ))
            )}
          </aside>
        ) : null}
      </div>

      <footer className="shell-composer">
        <input
          value={input}
          placeholder="Tell your agent what you want…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitMessage(input);
          }}
        />
        <button onClick={() => submitMessage(input)} disabled={!input.trim()}>
          Send
        </button>
      </footer>

      {pending ? (
        <div className="chrome-overlay" role="dialog" aria-modal="true">
          <div className="chrome-dialog">
            <div className="chrome-dialog-banner">
              {pending.dataRequest
                ? "Shell-verified request · guarded data disclosure"
                : "Shell-verified request · terms restated from the data object"}
            </div>
            <h2>{pending.action.title}</h2>
            <dl className="chrome-terms">
              {Object.entries(pending.action.terms).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="chrome-actions">
              <button className="chrome-decline" onClick={() => decide("declined")}>
                {pending.action.declineLabel ?? "Decline"}
              </button>
              <button className="chrome-approve" onClick={() => decide("approved")}>
                {pending.action.confirmLabel ?? "Approve"}
              </button>
            </div>
            <p className="chrome-footnote">
              This decision and the terms above will be recorded in your local attestation log.
            </p>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          llmConnectionInitial={llmConnection}
          savedLlmKeyHint={savedLlmKeyHint}
          agUiInitial={agUiConfig}
          registryInitial={registryUrl}
          trustInitial={registryTrust}
          revokedModules={revokedModules}
          curatorInitial={curatorEnabled}
          curatorAutoAcceptInitial={curatorAutoAcceptOpen}
          intent={settingsIntent}
          onClose={closeSettings}
          onSaveLlm={(connection, apiKey) => {
            if (apiKey !== undefined) {
              secretStore.set(connection.secretRef, apiKey);
            }
            persistLlmConnection(connection);
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
        />
      ) : null}
    </div>
  );
}

function SettingsDialog({
  llmConnectionInitial,
  savedLlmKeyHint,
  agUiInitial,
  registryInitial,
  trustInitial,
  revokedModules,
  curatorInitial,
  curatorAutoAcceptInitial,
  intent,
  onClose,
  onSaveLlm,
  onSaveAgUi,
  onSaveRegistry,
  onSaveCurator,
}: {
  llmConnectionInitial: LlmConnectionConfig | null;
  savedLlmKeyHint: string | null;
  agUiInitial: AgUiAgentConfig;
  registryInitial: string;
  trustInitial: RegistryTrustPolicy;
  revokedModules: readonly RegistryRevocation[];
  curatorInitial: boolean;
  curatorAutoAcceptInitial: boolean;
  intent: Provider | null;
  onClose: () => void;
  onSaveLlm: (connection: LlmConnectionConfig, apiKey?: string) => void;
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
  const hasSavedKey = Boolean(savedLlmKeyHint) && !changingKey;
  const llmValid =
    Boolean(baseUrl.trim() && model.trim()) &&
    (hasSavedKey || Boolean(apiKey.trim()));
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
          <h3>Live LLM</h3>
          <p className="settings-note">
            OpenAI-compatible chat endpoint. Browser-direct mode stores your API key separately
            from connection settings (local dev backend). For production, use AG-UI so keys stay
            on your server.
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
          <label className="atom-field atom-field-checkbox">
            <input type="checkbox" checked={curatorOn} onChange={(e) => setCuratorOn(e.target.checked)} />
            <span>Curator pass after each turn (extracts profile records from conversation)</span>
          </label>
          <label className="atom-field atom-field-checkbox">
            <input
              type="checkbox"
              checked={curatorAutoAcceptOn}
              disabled={!curatorOn}
              onChange={(e) => setCuratorAutoAcceptOn(e.target.checked)}
            />
            <span>
              Auto-save open (non-guarded) curator records so preferences apply on your next turn
            </span>
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
        </section>
        <section className="settings-section">
          <h3>AG-UI backend</h3>
          <p className="settings-note">
            POST endpoint that accepts RunAgentInput and streams AG-UI events (SSE). Reference
            server: <code>pnpm dev:ag-ui</code>
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
        <section className="settings-section">
          <h3>Module registry</h3>
          <p className="settings-note">
            Static index URL (Homebrew-tap style). Modules lazy-load on first composition
            reference. Manifest and bundle sha256 verified at install; optional Sigstore bundle
            digest match when signatureUrl is present.
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
            <span>Require Sigstore signatureUrl on manifests (digest match at install)</span>
          </label>
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
        </section>
        </div>
        <div className="settings-dialog-footer">
          {intent === "llm" ? (
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
