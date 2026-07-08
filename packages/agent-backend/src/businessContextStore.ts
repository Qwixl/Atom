import {
  BUSINESS_BRAND_CATEGORY,
  BUSINESS_POLICY_CATEGORY,
  brandPolicyLinesFromRecords,
} from "@qwixl/owner-store";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const CONTEXT_FILE = "business-context.json";
const SCHEMA_VERSION = 1;

export interface BusinessContextRecord {
  category: typeof BUSINESS_BRAND_CATEGORY | typeof BUSINESS_POLICY_CATEGORY;
  label: string;
  value: string;
}

interface ContextFile {
  schemaVersion: number;
  records: BusinessContextRecord[];
}

function isBusinessContextCategory(
  category: string,
): category is typeof BUSINESS_BRAND_CATEGORY | typeof BUSINESS_POLICY_CATEGORY {
  return category === BUSINESS_BRAND_CATEGORY || category === BUSINESS_POLICY_CATEGORY;
}

function parseRecord(body: Record<string, unknown>): BusinessContextRecord {
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!isBusinessContextCategory(category)) {
    throw new Error(`category must be ${BUSINESS_BRAND_CATEGORY} or ${BUSINESS_POLICY_CATEGORY}`);
  }
  if (!label) throw new Error("label required");
  if (!value) throw new Error("value required");
  return { category, label, value };
}

export class BusinessContextStore {
  private readonly records = new Map<string, BusinessContextRecord>();
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolveDataPath(CONTEXT_FILE)) {
    this.filePath = filePath;
  }

  private recordKey(record: Pick<BusinessContextRecord, "category" | "label">): string {
    return `${record.category}:${record.label.toLowerCase()}`;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<ContextFile>(this.filePath);
    if (!file?.records?.length) return;
    this.records.clear();
    for (const record of file.records) {
      if (!isBusinessContextCategory(record.category)) continue;
      if (!record.label?.trim() || typeof record.value !== "string") continue;
      this.records.set(this.recordKey(record), {
        category: record.category,
        label: record.label.trim(),
        value: record.value,
      });
    }
  }

  list(
    category?: typeof BUSINESS_BRAND_CATEGORY | typeof BUSINESS_POLICY_CATEGORY,
  ): BusinessContextRecord[] {
    const all = [...this.records.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (!category) return all;
    return all.filter((record) => record.category === category);
  }

  upsert(input: BusinessContextRecord): BusinessContextRecord {
    const record = parseRecord(input as unknown as Record<string, unknown>);
    this.records.set(this.recordKey(record), record);
    this.persist();
    return record;
  }

  remove(category: BusinessContextRecord["category"], label: string): boolean {
    const removed = this.records.delete(this.recordKey({ category, label }));
    if (removed) this.persist();
    return removed;
  }

  replaceAll(records: BusinessContextRecord[]): void {
    this.records.clear();
    for (const record of records) {
      const parsed = parseRecord(record as unknown as Record<string, unknown>);
      this.records.set(this.recordKey(parsed), parsed);
    }
    this.persist();
  }

  brandPolicyLines(): { brandLines: string[]; policyLines: string[] } {
    return brandPolicyLinesFromRecords(this.list());
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const payload: ContextFile = {
          schemaVersion: SCHEMA_VERSION,
          records: this.list(),
        };
        await atomicWriteJson(this.filePath, payload);
      })
      .catch((error) => {
        console.warn(
          `[business-context] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  async flush(): Promise<void> {
    await this.persistQueue;
  }
}

export function parseBusinessContextRecord(body: Record<string, unknown>): BusinessContextRecord {
  return parseRecord(body);
}
