import {
  attachHandlesToEntries,
  fetchBusinessIndex,
  filterBusinessIndex,
  type BusinessIndexEntry,
  type IndexEntryKind,
} from "@qwixl/business-index";
import { CommsAgentClient, type ResolvedDiscoverTarget } from "./comms/client.js";
import { saveContacts } from "./comms/storage.js";
import type { AgentContact } from "./comms/types.js";
import { DEFAULT_DISCOVER_INDEXES } from "./discoverIndexStorage.js";

export interface DiscoverActionEntry extends BusinessIndexEntry {
  resolved: ResolvedDiscoverTarget;
}

export function entryTitle(entry: BusinessIndexEntry): string {
  return entry.handle?.trim() || entry.displayName;
}

/** Resolve a discover entry via index hostUrl when present, else delegate to the user's agent. */
export async function resolveDiscoverEntryForClient(
  client: CommsAgentClient,
  entry: BusinessIndexEntry,
): Promise<ResolvedDiscoverTarget> {
  const hostUrl = entry.hostUrl?.trim();
  if (hostUrl) {
    try {
      const resp = await fetch(`${hostUrl.replace(/\/$/, "")}/discover/capabilities`);
      if (resp.ok) {
        const cap = (await resp.json()) as {
          did?: string;
          publicBaseUrl?: string;
          agentCardUrl?: string;
        };
        if (cap.did?.trim() && cap.publicBaseUrl?.trim()) {
          return {
            did: cap.did.trim(),
            adminBase: cap.publicBaseUrl.replace(/\/$/, ""),
            agentCardUrl:
              cap.agentCardUrl?.trim() ||
              `${cap.publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`,
            resolvedVia: "index-url",
          };
        }
      }
    } catch {
      /* fall through to agent-side resolve */
    }
  }
  return client.resolveDiscoverEntry(entry);
}

export async function filterAvailableDiscoverEntriesForClient(
  client: CommsAgentClient,
  entries: BusinessIndexEntry[],
): Promise<Array<{ entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget }>> {
  const settled = await Promise.all(
    entries.map(async (entry) => {
      try {
        const resolved = await resolveDiscoverEntryForClient(client, entry);
        return { entry, resolved };
      } catch {
        return null;
      }
    }),
  );
  return settled.filter((row): row is { entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget } => row !== null);
}

export async function connectDiscoverEntry(opts: {
  client: CommsAgentClient;
  entry: DiscoverActionEntry;
  contacts: AgentContact[];
}): Promise<{ contact: AgentContact; contacts: AgentContact[] }> {
      const { entry } = opts;
      const resolved = entry.resolved;
  await opts.client.connectPeer(resolved.agentCardUrl);
  const contact: AgentContact = {
    id: resolved.did,
    did: resolved.did,
    name: entry.displayName,
    handle: entry.handle,
    endpoint: resolved.agentCardUrl,
    connectedAt: new Date().toISOString(),
    kind: entry.kind === "community" ? "community" : "business",
    source: "discover",
  };
  const contacts = [...opts.contacts.filter((c) => c.did !== resolved.did), contact];
  saveContacts(contacts);
  return { contact, contacts };
}

export async function joinDiscoverRoom(opts: {
  client: CommsAgentClient;
  entry: DiscoverActionEntry;
  memberName?: string;
}): Promise<string> {
  const roomId = opts.entry.roomIds?.[0];
  if (!roomId) throw new Error("This listing has no joinable room.");
  await opts.client.joinRemoteRoom({
    hostUrl: opts.entry.resolved.adminBase,
    roomId,
    memberName: opts.memberName?.trim() || "Guest",
  });
  return roomId;
}

export async function quickJoinCoffeeShop(
  client: CommsAgentClient,
  memberName?: string,
): Promise<string> {
  const indexUrl = DEFAULT_DISCOVER_INDEXES.find((row) => row.label === "Community")?.url ?? "/community-index/index.json";
  const body = await fetchBusinessIndex(indexUrl);
  const matches = filterBusinessIndex(body, { kind: "community" }).filter(
    (entry) => (entry.roomIds?.length ?? 0) > 0,
  );
  const entry = matches.find((row) => row.displayName.toLowerCase().includes("coffee")) ?? matches[0];
  if (!entry) {
    throw new Error("Coffee Shop is not listed in the community index.");
  }
  const resolved = await resolveDiscoverEntryForClient(client, entry);
  return joinDiscoverRoom({ client, entry: { ...entry, resolved }, memberName });
}

/** True when the user has already joined every joinable room on this listing. */
export function isDiscoverEntryJoined(
  entry: BusinessIndexEntry,
  joinedRoomIds: ReadonlySet<string>,
): boolean {
  const roomIds = entry.roomIds ?? [];
  return roomIds.length > 0 && roomIds.every((roomId) => joinedRoomIds.has(roomId));
}

export type { IndexEntryKind, ResolvedDiscoverTarget };
