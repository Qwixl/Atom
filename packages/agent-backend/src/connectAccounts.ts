/**
 * Per-workspace Stripe Connect Express account persistence (BUS-01 / D139).
 * Atom Business merchants only — hosted workspaces.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";

const CONNECT_FILE = "connect-accounts.json";

export interface ConnectAccountRecord {
  workspaceId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  updatedAt: string;
}

function readAll(): Record<string, ConnectAccountRecord> {
  const filePath = resolveDataPath(CONNECT_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, ConnectAccountRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, ConnectAccountRecord>): void {
  const filePath = resolveDataPath(CONNECT_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

export function getConnectAccount(workspaceId: string): ConnectAccountRecord | null {
  const id = workspaceId.trim();
  if (!id) return null;
  return readAll()[id] ?? null;
}

export function setConnectAccount(record: ConnectAccountRecord): ConnectAccountRecord {
  const all = readAll();
  const next = { ...record, updatedAt: new Date().toISOString() };
  all[record.workspaceId] = next;
  writeAll(all);
  return next;
}
