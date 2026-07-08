import type { ConnectorVault, StoredCardDavAccount } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { normalizeCardDavAddressBookUrl, reportAddressBookContacts } from "./carddavHttp.js";
import { parseVCardContacts, type ContactSummary } from "./vcardParse.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const CARDDAV_CONNECTOR_ID = "carddav";

export const CARDDAV_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return configured CardDAV accounts (labels only, not URLs or credentials).",
    cacheTtlMs: 0,
  },
  {
    id: "listContacts",
    permission: "read",
    description:
      "List contacts from an address book. Optional input.accountId (defaults to all accounts) and input.query (name filter).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function carddavConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return CARDDAV_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireAccount(vault: ConnectorVault, accountId: string): StoredCardDavAccount {
  const accounts = vault.getCardDavAccounts();
  if (accounts.length === 0) {
    throw new Error("CardDAV not configured — add an account in Settings → Connectors");
  }
  const match = accounts.find((account) => account.id === accountId.trim());
  if (!match) {
    throw new Error(`Unknown CardDAV account id "${accountId}"`);
  }
  return match;
}

function resolveAccounts(vault: ConnectorVault, accountId?: string): StoredCardDavAccount[] {
  const accounts = vault.getCardDavAccounts();
  if (accounts.length === 0) {
    throw new Error("CardDAV not configured — add an account in Settings → Connectors");
  }
  if (!accountId?.trim()) return accounts;
  return [requireAccount(vault, accountId)];
}

function contactMatchesQuery(contact: ContactSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    contact.name,
    contact.organization,
    ...contact.emails,
    ...contact.phones,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export async function invokeCardDavConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = carddavConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const accounts = ctx.vault.getCardDavAccounts();
      return {
        operation: operationId,
        result: {
          connected: accounts.length > 0,
          accountCount: accounts.length,
          accounts: accounts.map((account) => ({ id: account.id, label: account.label })),
          provider: "carddav",
        },
      };
    }
    case "listContacts": {
      const query = String(input.query ?? "").trim();
      const accounts = resolveAccounts(ctx.vault, String(input.accountId ?? "").trim() || undefined);
      const contacts: Array<ContactSummary & { accountId: string; accountLabel: string }> = [];
      for (const account of accounts) {
        const auth = { username: account.username, password: account.password };
        let vcardChunks: string[];
        try {
          vcardChunks = await reportAddressBookContacts(account.addressBookUrl, auth, query || undefined);
        } catch (error) {
          if (query) {
            vcardChunks = await reportAddressBookContacts(account.addressBookUrl, auth);
          } else {
            throw error;
          }
        }
        for (const chunk of vcardChunks) {
          for (const contact of parseVCardContacts(chunk)) {
            if (query && !contactMatchesQuery(contact, query)) continue;
            contacts.push({
              ...contact,
              accountId: account.id,
              accountLabel: account.label,
            });
          }
        }
      }
      contacts.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      return { operation: operationId, result: { query: query || undefined, contacts } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function addCardDavAccountToVault(
  vault: ConnectorVault,
  input: { label?: string; addressBookUrl: string; username: string; password: string },
): Promise<{ id: string; label: string }> {
  const addressBookUrl = normalizeCardDavAddressBookUrl(input.addressBookUrl);
  validateConnectorHttpsUrl(addressBookUrl);
  const username = input.username.trim();
  const password = input.password.trim();
  if (!username || !password) {
    throw new Error("username and password required");
  }
  const account = await vault.addCardDavAccount({
    label: input.label?.trim() || "CardDAV",
    addressBookUrl,
    username,
    password,
  });
  return { id: account.id, label: account.label };
}

export async function removeCardDavAccountFromVault(
  vault: ConnectorVault,
  accountId: string,
): Promise<boolean> {
  return vault.removeCardDavAccount(accountId.trim());
}
