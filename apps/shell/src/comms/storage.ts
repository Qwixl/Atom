import { loadJsonFromStorage, loadStringFromStorage, saveJsonToStorage, saveStringToStorage } from "@qwixl/shell-core";
import type { OwnerRecord } from "@qwixl/owner-store";
import { clearProtectedString, readProtectedStringAsync, writeProtectedString } from "../custody/dataVault.js";
import { mergeContactFromTrustedAgent } from "./trustedAgent.js";
import type { AgentContact, CommsAgentConfig } from "./types.js";

const CONTACTS_KEY = "atom-comms-contacts";
const AGENT_URL_KEY = "atom-comms-agent-url";
const AGENT_TOKEN_KEY = "atom-comms-admin-token";

export const DEFAULT_COMMS_AGENT_URL = "http://127.0.0.1:5204";

const ENC_PREFIX = "atom-enc:";

export function loadCommsAgentConfig(): CommsAgentConfig {
  const url = loadStringFromStorage(AGENT_URL_KEY)?.trim();
  if (typeof localStorage !== "undefined" && localStorage.getItem(`${ENC_PREFIX}${AGENT_TOKEN_KEY}`)) {
    return {
      adminUrl: url || DEFAULT_COMMS_AGENT_URL,
      adminToken: undefined,
    };
  }
  const adminToken = loadStringFromStorage(AGENT_TOKEN_KEY)?.trim();
  return {
    adminUrl: url || DEFAULT_COMMS_AGENT_URL,
    adminToken: adminToken || undefined,
  };
}

export async function loadCommsAgentConfigSecure(): Promise<CommsAgentConfig> {
  const url = loadStringFromStorage(AGENT_URL_KEY)?.trim();
  const adminToken = (await readProtectedStringAsync(AGENT_TOKEN_KEY))?.trim();
  return {
    adminUrl: url || DEFAULT_COMMS_AGENT_URL,
    adminToken: adminToken || undefined,
  };
}

export function saveCommsAgentConfig(config: CommsAgentConfig): void {
  saveStringToStorage(AGENT_URL_KEY, config.adminUrl.trim());
  const token = config.adminToken?.trim();
  if (token) saveStringToStorage(AGENT_TOKEN_KEY, token);
  else clearCommsAdminToken();
}

export async function saveCommsAgentConfigSecure(config: CommsAgentConfig): Promise<void> {
  saveStringToStorage(AGENT_URL_KEY, config.adminUrl.trim());
  const token = config.adminToken?.trim();
  if (token) await writeProtectedString(AGENT_TOKEN_KEY, token);
  else clearCommsAdminToken();
}

export function clearCommsAdminToken(): void {
  clearProtectedString(AGENT_TOKEN_KEY);
}

const OWNER_AGENT_KIND_KEY = "atom-owner-agent-kind";

export type OwnerAgentKind = "hosted" | "self-hosted";

export function saveOwnerAgentKind(kind: OwnerAgentKind): void {
  saveStringToStorage(OWNER_AGENT_KIND_KEY, kind);
}

export function loadOwnerAgentKind(config?: CommsAgentConfig): OwnerAgentKind | undefined {
  const value = loadStringFromStorage(OWNER_AGENT_KIND_KEY)?.trim();
  if (value === "hosted" || value === "self-hosted") return value;
  if (config) {
    const host = config.adminUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (/\.agents\.qwixl\.dev$/i.test(host) || host === "127.0.0.1:5301") return "hosted";
  }
  return undefined;
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
