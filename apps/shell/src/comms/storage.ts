import { loadJsonFromStorage, loadStringFromStorage, saveJsonToStorage, saveStringToStorage } from "@qwixl/shell-core";
import type { OwnerRecord } from "@qwixl/owner-store";
import { mergeContactFromTrustedAgent } from "./trustedAgent.js";
import type { AgentContact, CommsAgentConfig } from "./types.js";

const CONTACTS_KEY = "atom-comms-contacts";
const AGENT_URL_KEY = "atom-comms-agent-url";

export const DEFAULT_COMMS_AGENT_URL = "http://127.0.0.1:5204";

export function loadCommsAgentConfig(): CommsAgentConfig {
  const url = loadStringFromStorage(AGENT_URL_KEY)?.trim();
  return { adminUrl: url || DEFAULT_COMMS_AGENT_URL };
}

export function saveCommsAgentConfig(config: CommsAgentConfig): void {
  saveStringToStorage(AGENT_URL_KEY, config.adminUrl.trim());
}

export function loadContacts(ownerRecords?: readonly OwnerRecord[]): AgentContact[] {
  const parsed = loadJsonFromStorage<AgentContact[]>(CONTACTS_KEY);
  if (!Array.isArray(parsed)) return [];
  const contacts = parsed.filter(
    (item): item is AgentContact =>
      typeof item?.id === "string" &&
      typeof item?.did === "string" &&
      typeof item?.endpoint === "string",
  );
  if (!ownerRecords?.length) return contacts;
  return contacts.map((contact) => mergeContactFromTrustedAgent(contact, ownerRecords));
}

export function saveContacts(contacts: AgentContact[]): void {
  saveJsonToStorage(CONTACTS_KEY, contacts);
}
