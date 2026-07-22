import { useCallback, useEffect, useMemo, useState } from "react";

import {
  attachHandlesToEntries,
  filterBusinessIndex,
  fetchBusinessIndex,
  fetchHandleIndex,
  type BusinessIndexEntry,
  type IndexEntryKind,
} from "@qwixl/business-index";

import type { ResolvedDiscoverTarget } from "./comms/client.js";
import { connectDiscoverEntry, joinDiscoverRoom, entryTitle, filterAvailableDiscoverEntriesForClient, isDiscoverEntryJoined } from "./discoverActions.js";
import { ownerHandleForRooms } from "./ownerHandle.js";
import { isAgentAuthError } from "./comms/agentErrors.js";
import { useAgentConfig } from "./comms/useAgentConfig.js";
import type { AgentContact } from "./comms/types.js";
import {
  DEFAULT_DISCOVER_INDEXES,
  DEFAULT_HANDLE_INDEX_URL,
  loadDiscoverIndexes,
} from "./discoverIndexStorage.js";
import { discoverTrustSignals } from "./discoverTrust.js";
import { swarmDiscoverBadge } from "./swarmBadge.js";
import { PanelFilterPills } from "./shell/PanelChrome.js";

interface DiscoverPanelProps {
  contacts: AgentContact[];
  onContactsChange: (contacts: AgentContact[]) => void;
  onJoinedRoom?: (roomId: string) => void;
  onDmStarted?: (contactId: string) => void;
  onActivity?: (note: string) => void;
  vaultUnlocked?: boolean;
  agentConnectionReady?: boolean;
  onAgentAuthFailure?: () => void | Promise<void>;
  onRequestReconnect?: () => void;
}

interface DiscoverResult extends BusinessIndexEntry {
  indexLabel: string;
  indexUrl?: string;
  resolved: ResolvedDiscoverTarget;
}

function kindLabel(kind: IndexEntryKind | undefined): string {
  if (kind === "community") return "Community";
  if (kind === "developer") return "Developer";
  return "Business";
}

function entrySubtitle(entry: BusinessIndexEntry): string | null {
  if (entry.handle?.trim() && entry.displayName.trim()) {
    return entry.displayName;
  }
  if (entry.categories.length > 0) {
    return entry.categories.join(" · ");
  }
  return null;
}

function entryBlurb(entry: BusinessIndexEntry): string {
  if (entry.kind === "community") {
    return "Join their room — meet the host agent and people already there.";
  }
  if (entry.kind === "developer") {
    return "Message this developer agent about tools, modules, or support.";
  }
  return "Start a private DM with this business agent.";
}

export function DiscoverPanel({
  contacts,
  onContactsChange,
  onJoinedRoom,
  onDmStarted,
  onActivity,
  vaultUnlocked = true,
  agentConnectionReady = true,
  onAgentAuthFailure,
  onRequestReconnect,
}: DiscoverPanelProps) {
  const { client, sessionReady } = useAgentConfig(vaultUnlocked);
  const connectionActive = agentConnectionReady && vaultUnlocked && sessionReady;
  const indexConfigs = useMemo(() => loadDiscoverIndexes(), []);

  const [terms, setTerms] = useState("");
  const [debouncedTerms, setDebouncedTerms] = useState("");
  const [kind, setKind] = useState<IndexEntryKind | "all">("all");
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [indexMatches, setIndexMatches] = useState(0);
  const [joinedRoomIds, setJoinedRoomIds] = useState<Set<string>>(() => new Set());
  const [searchNonce, setSearchNonce] = useState(0);

  const refreshJoinedRooms = useCallback(async () => {
    if (!connectionActive) {
      setJoinedRoomIds(new Set());
      return;
    }
    try {
      const body = await client.listRooms();
      setJoinedRoomIds(new Set((body.joined ?? []).map((entry) => entry.roomId)));
    } catch {
      setJoinedRoomIds(new Set());
    }
  }, [client, connectionActive]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerms(terms), 400);
    return () => window.clearTimeout(timer);
  }, [terms]);

  useEffect(() => {
    if (!connectionActive) {
      setStatus(null);
      setResults([]);
      setIndexMatches(0);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setStatus(null);
    void (async () => {
      try {
        const indexList = indexConfigs.length > 0 ? indexConfigs : DEFAULT_DISCOVER_INDEXES;
        const indexBodies = await Promise.all(
          indexList.map(async (index) => {
            try {
              const body = await fetchBusinessIndex(index.url);
              return { index, body };
            } catch {
              return null;
            }
          }),
        );
        if (abort.signal.aborted) return;
        const merged: Array<BusinessIndexEntry & { indexLabel: string; indexUrl: string }> = [];
        for (const row of indexBodies) {
          if (!row) continue;
          const filtered = filterBusinessIndex(row.body, {
            terms: debouncedTerms.trim() || undefined,
            kind: kind === "all" ? undefined : kind,
          });
          for (const entry of filtered) {
            merged.push({ ...entry, indexLabel: row.index.label, indexUrl: row.index.url });
          }
        }

        let withHandles = merged;
        try {
          const handleIndex = await fetchHandleIndex(DEFAULT_HANDLE_INDEX_URL);
          withHandles = attachHandlesToEntries(merged, handleIndex.handles).map((entry, index) => ({
            ...entry,
            indexLabel: merged[index]!.indexLabel,
            indexUrl: merged[index]!.indexUrl,
          }));
        } catch {
          // Handle index is optional until M20 is fully deployed.
        }
        if (abort.signal.aborted) return;

        const available = await filterAvailableDiscoverEntriesForClient(client, withHandles);
        if (abort.signal.aborted) return;
        const metaByKey = new Map(
          withHandles.map((row) => [
            `${row.displayName}\0${row.businessDomain ?? ""}`,
            { indexLabel: row.indexLabel, indexUrl: row.indexUrl },
          ]),
        );
        setIndexMatches(withHandles.length);
        setResults(
          available.map(({ entry, resolved }) => {
            const meta = metaByKey.get(`${entry.displayName}\0${entry.businessDomain ?? ""}`);
            return {
              ...entry,
              indexLabel: meta?.indexLabel ?? "Index",
              indexUrl: meta?.indexUrl,
              resolved,
            };
          }),
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        if (isAgentAuthError(error)) onAgentAuthFailure?.();
        setStatus(error instanceof Error ? error.message : String(error));
        setResults([]);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [client, connectionActive, debouncedTerms, indexConfigs, kind, onAgentAuthFailure, searchNonce]);

  useEffect(() => {
    void refreshJoinedRooms();
  }, [refreshJoinedRooms]);

  async function connectEntry(entry: DiscoverResult): Promise<void> {
    setLoading(true);
    setStatus(null);
    try {
      const { contact, contacts: next } = await connectDiscoverEntry({
        client,
        entry,
        contacts,
      });
      onContactsChange(next);
      onActivity?.(`DM with ${entryTitle(entry)}`);
      onDmStarted?.(contact.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(entry: DiscoverResult): Promise<void> {
    setLoading(true);
    setStatus(null);
    try {
      const roomId = await joinDiscoverRoom({
        client,
        entry,
        memberName: ownerHandleForRooms(),
      });
      await refreshJoinedRooms();
      onJoinedRoom?.(roomId);
      onActivity?.(`Joined ${entryTitle(entry)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const kindFilters: Array<{ value: IndexEntryKind | "all"; label: string }> = [
    { value: "all", label: "Everyone" },
    { value: "community", label: "Communities" },
    { value: "business", label: "Businesses" },
    { value: "developer", label: "Developers" },
  ];

  return (
    <aside className="panel-view discover-view">
      <header className="panel-surface-hero">
        <div className="panel-surface-hero-copy">
          <p className="panel-surface-eyebrow">Discover</p>
          <h1 className="panel-surface-title">Meet agents worth knowing</h1>
          <p className="panel-surface-lede">
            Browse curated indexes for communities, businesses, and developers. Start a DM, or join
            a room — your agent stays with you the whole way.
          </p>
        </div>
        <ul className="panel-surface-steps" aria-label="How Discover works">
          <li>
            <span className="panel-surface-step-num">1</span>
            <span>Find someone</span>
          </li>
          <li>
            <span className="panel-surface-step-num">2</span>
            <span>DM or join their room</span>
          </li>
          <li>
            <span className="panel-surface-step-num">3</span>
            <span>Keep talking in Messages or Rooms</span>
          </li>
        </ul>
      </header>

      <PanelFilterPills
        ariaLabel="Filter discover listings"
        value={kind}
        options={kindFilters}
        onChange={setKind}
      />

      <div className="discover-search-strip">
        <input
          className="panel-input"
          type="search"
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          placeholder="Search by name, @handle, or topic…"
          aria-label="Search discover index"
        />
        <button
          type="button"
          className="panel-btn panel-btn-primary"
          onClick={() => setSearchNonce((n) => n + 1)}
          disabled={loading}
        >
          {loading ? "Checking…" : "Search"}
        </button>
      </div>

      {status ? (
        <div className="comms-status-error">
          <p>{status}</p>
          {onRequestReconnect ? (
            <button type="button" className="panel-btn" onClick={onRequestReconnect}>
              Reconnect agent
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && results.length > 0 ? (
        <p className="discover-status-bar" aria-live="polite">
          {results.length} agent{results.length === 1 ? "" : "s"} ready to meet
        </p>
      ) : null}

      <div className="panel-body panel-body-scroll" style={{ padding: 0 }}>
        {results.length === 0 && !loading ? (
          <div className="panel-empty-state">
            <strong>
              {indexMatches > 0
                ? "Hosts are offline right now"
                : terms.trim()
                  ? "Nothing matched"
                  : "No listings yet"}
            </strong>
            <p>
              {indexMatches > 0
                ? "Matches exist in an index, but their agent host is offline. Try again shortly, or open Rooms → Join Coffee Shop."
                : terms.trim()
                  ? "Curated listings are limited on purpose — try a different name or @handle."
                  : "Third-party indexes are owner-chosen when you opt in. Atom only curates the store that ships with this shell."}
            </p>
          </div>
        ) : (
          <ul className="discover-results-grid">
            {results.map((entry) => {
              const subtitle = entrySubtitle(entry);
              const trust = discoverTrustSignals(entry, entry.indexLabel, entry.indexUrl);
              const swarm = swarmDiscoverBadge(entry);
              const canJoin =
                (entry.kind === "community" || (entry.roomIds?.length ?? 0) > 0) &&
                !isDiscoverEntryJoined(entry, joinedRoomIds);
              return (
                <li key={`${entry.indexLabel}:${entry.businessDomain}:${entry.displayName}`}>
                  <article className="discover-card">
                    <header className="discover-card-head">
                      <h3 className="discover-card-title">{entryTitle(entry)}</h3>
                      <div className="discover-card-badges">
                        <span className="discover-kind">{kindLabel(entry.kind)}</span>
                        {swarm ? (
                          <span className={swarm.className} title="Qwixl-operated labeled swarm agent">
                            {swarm.label}
                          </span>
                        ) : null}
                        <span
                          className={`discover-trust discover-trust--${trust.badge}`}
                          title={
                            trust.publisherDid
                              ? `${trust.label} · ${trust.publisherDid}`
                              : trust.label
                          }
                        >
                          {trust.label}
                        </span>
                      </div>
                      {subtitle ? <p className="discover-card-meta">{subtitle}</p> : null}
                      <p className="discover-card-blurb">{entryBlurb(entry)}</p>
                    </header>
                    <footer className="discover-card-actions">
                      {canJoin ? (
                        <button
                          type="button"
                          className="panel-btn panel-btn-primary"
                          disabled={loading}
                          onClick={() => void joinRoom(entry)}
                        >
                          Join room
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="panel-btn discover-dm-btn"
                        disabled={loading}
                        onClick={() => void connectEntry(entry)}
                        aria-label={`Send DM to ${entryTitle(entry)}`}
                      >
                        Message
                      </button>
                    </footer>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
