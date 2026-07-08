import { useCallback, useEffect, useMemo, useState } from "react";

import {
  attachHandlesToEntries,
  filterBusinessIndex,
  fetchBusinessIndex,
  fetchHandleIndex,
  type BusinessIndexEntry,
  type IndexEntryKind,
} from "@qwixl/business-index";

import { CommsAgentClient, type ResolvedDiscoverTarget } from "./comms/client.js";
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

interface DiscoverPanelProps {
  contacts: AgentContact[];
  onContactsChange: (contacts: AgentContact[]) => void;
  onJoinedRoom?: (roomId: string) => void;
  onDmStarted?: (contactId: string) => void;
  onActivity?: (note: string) => void;
  vaultUnlocked?: boolean;
  agentConnectionReady?: boolean;
  onAgentAuthFailure?: () => void;
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
  const { client } = useAgentConfig(vaultUnlocked);
  const connectionActive = agentConnectionReady && vaultUnlocked;
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

  return (
    <aside className="panel-view discover-view">
      <div className="panel-search-bar">
        <input
          className="panel-input"
          type="search"
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
          placeholder="Search by name, @handle, or topic…"
          aria-label="Search discover index"
        />
        <select
          className="panel-select"
          value={kind}
          onChange={(event) => setKind(event.target.value as IndexEntryKind | "all")}
          aria-label="Filter by kind"
        >
          <option value="all">All kinds</option>
          <option value="community">Community</option>
          <option value="business">Business</option>
          <option value="developer">Developer</option>
        </select>
        <button
          type="button"
          className="panel-btn"
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

      <div className="panel-body panel-body-scroll" style={{ padding: 0 }}>
        <ul className="discover-results">
          {results.length === 0 && !loading ? (
            <li className="panel-empty">
              {indexMatches > 0
                ? "Listings were found but their host is not reachable yet. Try again shortly, or use Join Coffee Shop in Rooms."
                : terms.trim()
                  ? "Nothing matched your search. Try different terms or check again later."
                  : "No listings in the index yet. Federated indexes are owner-chosen — Atom curates the default store only. Try again later."}
            </li>
          ) : (
            results.map((entry) => {
              const subtitle = entrySubtitle(entry);
              const trust = discoverTrustSignals(entry, entry.indexLabel, entry.indexUrl);
              return (
                <li
                  key={`${entry.indexLabel}:${entry.businessDomain}:${entry.displayName}`}
                  className="discover-row"
                >
                  <div className="discover-row-main">
                    <div className="discover-row-title">
                      <span>{entryTitle(entry)}</span>
                      <span className="discover-kind">{kindLabel(entry.kind)}</span>
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
                    {subtitle ? <p className="discover-row-meta">{subtitle}</p> : null}
                    {trust.publisherDid ? (
                      <p className="discover-row-meta discover-publisher">
                        Publisher {trust.publisherDid}
                      </p>
                    ) : null}
                  </div>
                  <div className="discover-row-actions">
                    {(entry.kind === "community" || (entry.roomIds?.length ?? 0) > 0) &&
                    !isDiscoverEntryJoined(entry, joinedRoomIds) ? (
                      <button
                        type="button"
                        className="panel-btn"
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
                      <span className="discover-dm-icon" aria-hidden="true">
                        ✉
                      </span>
                      DM
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
