import type { ConnectorVault, StoredCalDavAccount } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import {
  normalizeCalDavCalendarUrl,
  propfindCalendars,
  putCalendarObject,
  reportCalendarEvents,
} from "./caldavHttp.js";
import { buildIcsCalendar } from "./icalFeed.js";
import { parseVEventsFromCalendar, type CalendarEventSummary } from "./webcal.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const CALDAV_CONNECTOR_ID = "caldav";

export const CALDAV_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return configured CalDAV accounts (labels only, not URLs or credentials).",
    cacheTtlMs: 0,
  },
  {
    id: "listCalendars",
    permission: "read",
    description: "List calendars for an account (input.accountId required).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
  {
    id: "listEvents",
    permission: "read",
    description:
      "List events between timeMin and timeMax (ISO 8601). Optional input.accountId; defaults to all accounts.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function caldavConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return CALDAV_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

function requireAccount(vault: ConnectorVault, accountId: string): StoredCalDavAccount {
  const accounts = vault.getCalDavAccounts();
  if (accounts.length === 0) {
    throw new Error("CalDAV not configured — add an account in Settings → Connectors");
  }
  const match = accounts.find((account) => account.id === accountId.trim());
  if (!match) {
    throw new Error(`Unknown CalDAV account id "${accountId}"`);
  }
  return match;
}

function resolveAccounts(vault: ConnectorVault, accountId?: string): StoredCalDavAccount[] {
  const accounts = vault.getCalDavAccounts();
  if (accounts.length === 0) {
    throw new Error("CalDAV not configured — add an account in Settings → Connectors");
  }
  if (!accountId?.trim()) return accounts;
  return [requireAccount(vault, accountId)];
}

function defaultTimeRange(input: Record<string, unknown>): { timeMin: string; timeMax: string } {
  const now = new Date();
  const timeMin =
    String(input.timeMin ?? "").trim() ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax =
    String(input.timeMax ?? "").trim() ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();
  return { timeMin, timeMax };
}

export async function invokeCalDavConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = caldavConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus": {
      const accounts = ctx.vault.getCalDavAccounts();
      return {
        operation: operationId,
        result: {
          connected: accounts.length > 0,
          accountCount: accounts.length,
          accounts: accounts.map((account) => ({ id: account.id, label: account.label })),
          provider: "caldav",
        },
      };
    }
    case "listCalendars": {
      const accountId = String(input.accountId ?? "").trim();
      if (!accountId) {
        throw new Error("accountId required");
      }
      const account = requireAccount(ctx.vault, accountId);
      const auth = { username: account.username, password: account.password };
      const calendars = await propfindCalendars(account.calendarUrl, auth);
      return {
        operation: operationId,
        result: {
          accountId: account.id,
          calendars: calendars.map((entry) => ({ href: entry.href, name: entry.name })),
        },
      };
    }
    case "listEvents": {
      const { timeMin, timeMax } = defaultTimeRange(input);
      const accounts = resolveAccounts(ctx.vault, String(input.accountId ?? "").trim() || undefined);
      const events: Array<CalendarEventSummary & { accountId: string; accountLabel: string }> = [];
      for (const account of accounts) {
        const auth = { username: account.username, password: account.password };
        const chunks = await reportCalendarEvents(account.calendarUrl, auth, timeMin, timeMax);
        for (const chunk of chunks) {
          for (const event of parseVEventsFromCalendar(chunk)) {
            events.push({
              ...event,
              accountId: account.id,
              accountLabel: account.label,
            });
          }
        }
      }
      events.sort((a, b) => a.start.localeCompare(b.start));
      return { operation: operationId, result: { timeMin, timeMax, events } };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function addCalDavAccountToVault(
  vault: ConnectorVault,
  input: { label?: string; calendarUrl: string; username: string; password: string },
): Promise<{ id: string; label: string }> {
  const calendarUrl = normalizeCalDavCalendarUrl(input.calendarUrl);
  validateConnectorHttpsUrl(calendarUrl);
  const username = input.username.trim();
  const password = input.password.trim();
  if (!username || !password) {
    throw new Error("username and password required");
  }
  const account = await vault.addCalDavAccount({
    label: input.label?.trim() || "CalDAV",
    calendarUrl,
    username,
    password,
  });
  return { id: account.id, label: account.label };
}

export async function removeCalDavAccountFromVault(
  vault: ConnectorVault,
  accountId: string,
): Promise<boolean> {
  return vault.removeCalDavAccount(accountId.trim());
}

export async function createCalDavEvent(
  vault: ConnectorVault,
  input: {
    accountId: string;
    summary: string;
    start: string;
    end: string;
    description?: string;
  },
): Promise<{ uid: string; summary: string }> {
  const account = requireAccount(vault, input.accountId);
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error("summary required");
  }
  const uid = `atom-${crypto.randomUUID()}@atom.local`;
  const ics = buildIcsCalendar([
    {
      uid,
      summary,
      start: input.start,
      end: input.end,
      description: input.description?.trim() || undefined,
    },
  ]);
  await putCalendarObject(
    account.calendarUrl,
    { username: account.username, password: account.password },
    uid,
    ics,
  );
  return { uid, summary };
}
