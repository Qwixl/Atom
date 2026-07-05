import type { BusinessIndexEntry, IndexEntryKind } from "@qwixl/business-index";
import { CommsAgentClient, type ResolvedDiscoverTarget } from "./comms/client.js";
import { saveContacts } from "./comms/storage.js";
import type { AgentContact } from "./comms/types.js";

export interface DiscoverActionEntry extends BusinessIndexEntry {
  resolved: ResolvedDiscoverTarget;
}

export function entryTitle(entry: BusinessIndexEntry): string {
  return entry.handle?.trim() || entry.displayName;
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
    memberName: opts.memberName ?? "Guest",
  });
  return roomId;
}

export type { IndexEntryKind, ResolvedDiscoverTarget };
