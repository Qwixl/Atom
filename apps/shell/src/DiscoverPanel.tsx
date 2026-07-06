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
  const [kind, setKind] = useState<IndexEntryKind | "all">("all");
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [indexMatches, setIndexMatches] = useState(0);
  const [joinedRoomIds, setJoinedRoomIds] = useState<Set<string>>(() => new Set());

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

  const loadResults = useCallback(async () => {
    if (!connectionActive) {
      setStatus(null);
      setResults([]);
      setIndexMatches(0);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const merged: Array<BusinessIndexEntry & { indexLabel: string }> = [];
      for (const index of indexConfigs.length > 0 ? indexConfigs : DEFAULT_DISCOVER_INDEXES) {
        const body = await fetchBusinessIndex(index.url);
        const filtered = filterBusinessIndex(body, {
          terms: terms.trim() || undefined,
          kind: kind === "all" ? undefined : kind,
        });
        for (const entry of filtered) {
          merged.push({ ...entry, indexLabel: index.label });
        }
      }

      let withHandles = merged;
      try {
        const handleIndex = await fetchHandleIndex(DEFAULT_HANDLE_INDEX_URL);
        const attached = attachHandlesToEntries(merged, handleIndex.handles);
        withHandles = attached.map((entry, index) => ({
          ...entry,
          indexLabel: merged[index]!.indexLabel,
        }));
      } catch {
        // Handle index is optional until M20 is fully deployed.
      }

      const available = await filterAvailableDiscoverEntriesForClient(client, withHandles);
      setIndexMatches(withHandles.length);
      setResults(
        available.map(({ entry, resolved }) => {
          const orig = withHandles.find(
            (row) => row.displayName === entry.displayName && row.businessDomain === entry.businessDomain,
          );
          return {
            ...entry,
            indexLabel: orig?.indexLabel ?? "Index",
            resolved,
          };
        }),
      );
    } catch (error) {
      if (isAgentAuthError(error)) onAgentAuthFailure?.();
      setStatus(error instanceof Error ? error.message : String(error));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [client, connectionActive, indexConfigs, kind, onAgentAuthFailure, terms]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

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
        <button type="button" className="panel-btn" onClick={() => void loadResults()} disabled={loading}>
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
                  : "No listings in the index yet. Try again later."}
            </li>
          ) : (
            results.map((entry) => {
              const subtitle = entrySubtitle(entry);
              return (
                <li
                  key={`${entry.indexLabel}:${entry.businessDomain}:${entry.displayName}`}
                  className="discover-row"
                >
                  <div className="discover-row-main">
                    <div className="discover-row-title">
                      <span>{entryTitle(entry)}</span>
                      <span className="discover-kind">{kindLabel(entry.kind)}</span>
                    </div>
                    {subtitle ? <p className="discover-row-meta">{subtitle}</p> : null}
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
