import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";
import type { SpendCategory } from "./spendPolicy.js";

export interface BudgetLedgerEntry {
  id: string;
  workspaceId: string;
  category: SpendCategory;
  amountMinor: number;
  currency: string;
  description: string;
  recordedAt: string;
}

const LEDGER_FILE = "budget-ledger.json";

export class BudgetLedgerStore {
  private readonly filePath: string;
  private memory: BudgetLedgerEntry[] | null = null;

  constructor(filePath = resolveDataPath(LEDGER_FILE)) {
    this.filePath = filePath;
  }

  private readAll(): BudgetLedgerEntry[] {
    if (this.memory) return this.memory;
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as BudgetLedgerEntry[];
      this.memory = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.memory = [];
    }
    return this.memory;
  }

  private writeAll(entries: BudgetLedgerEntry[]): void {
    this.memory = entries;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  }

  append(entry: Omit<BudgetLedgerEntry, "id" | "recordedAt">): BudgetLedgerEntry {
    const record: BudgetLedgerEntry = {
      ...entry,
      id: `spend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recordedAt: new Date().toISOString(),
    };
    const all = [...this.readAll(), record];
    this.writeAll(all);
    return record;
  }

  monthSpentMinor(workspaceId: string, currency: string, at = new Date()): number {
    const month = at.toISOString().slice(0, 7);
    return this.readAll()
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.currency.toUpperCase() === currency.toUpperCase() &&
          entry.recordedAt.startsWith(month),
      )
      .reduce((sum, entry) => sum + entry.amountMinor, 0);
  }

  list(workspaceId?: string): BudgetLedgerEntry[] {
    const all = this.readAll();
    return workspaceId ? all.filter((entry) => entry.workspaceId === workspaceId) : all;
  }
}
