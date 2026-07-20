import type { BusinessIndexEntry, IndexEntryKind } from "@qwixl/business-index";
import type { ResolvedDiscoverTarget } from "./comms/client.js";
import { entryTitle } from "./discoverActions.js";
import { discoverTrustSignals } from "./discoverTrust.js";
import { swarmDiscoverBadge } from "./swarmBadge.js";

export interface DiscoverChatResult {
  entry: BusinessIndexEntry;
  resolved: ResolvedDiscoverTarget;
  indexLabel: string;
  indexUrl?: string;
}

interface DiscoverChatResultsProps {
  results: DiscoverChatResult[];
  busy?: boolean;
  onDm: (result: DiscoverChatResult) => void;
  onJoinRoom: (result: DiscoverChatResult) => void;
  onOpenDiscover?: () => void;
}

function kindLabel(kind: IndexEntryKind | undefined): string {
  if (kind === "community") return "Community";
  if (kind === "developer") return "Developer";
  return "Business";
}

export function DiscoverChatResults({
  results,
  busy = false,
  onDm,
  onJoinRoom,
  onOpenDiscover,
}: DiscoverChatResultsProps) {
  return (
    <div className="discover-chat-results">
      <ul className="discover-results">
        {results.map((result) => {
          const { entry } = result;
          const trust = discoverTrustSignals(entry, result.indexLabel, result.indexUrl);
          const swarm = swarmDiscoverBadge(entry);
          const subtitle =
            entry.handle?.trim() && entry.displayName.trim() && entry.handle !== entry.displayName
              ? entry.displayName
              : entry.categories.length > 0
                ? entry.categories.join(" · ")
                : null;
          return (
            <li
              key={`${result.indexLabel}:${entry.businessDomain}:${entry.displayName}`}
              className="discover-row"
            >
              <div className="discover-row-main">
                <div className="discover-row-title">
                  <span>{entryTitle(entry)}</span>
                  <span className="discover-kind">{kindLabel(entry.kind)}</span>
                  {swarm ? (
                    <span className={swarm.className} title="Qwixl-operated labeled swarm agent">
                      {swarm.label}
                    </span>
                  ) : null}
                  <span
                    className={`discover-trust discover-trust--${trust.badge}`}
                    title={
                      trust.publisherDid ? `${trust.label} · ${trust.publisherDid}` : trust.label
                    }
                  >
                    {trust.label}
                  </span>
                </div>
                {subtitle ? <p className="discover-row-meta">{subtitle}</p> : null}
              </div>
              <div className="discover-row-actions">
                {(entry.kind === "community" || (entry.roomIds?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    className="panel-btn"
                    disabled={busy}
                    onClick={() => onJoinRoom(result)}
                  >
                    Join room
                  </button>
                )}
                <button
                  type="button"
                  className="panel-btn discover-dm-btn"
                  disabled={busy}
                  onClick={() => onDm(result)}
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
        })}
      </ul>
      {onOpenDiscover ? (
        <button type="button" className="panel-btn-ghost discover-chat-more" onClick={onOpenDiscover}>
          Open Discover
        </button>
      ) : null}
    </div>
  );
}
