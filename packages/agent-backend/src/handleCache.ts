import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";
import type { ResolvedDiscoverTarget } from "./serviceDiscovery.js";

const CACHE_FILE = "handle-cache.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface HandleCacheRecord {
  handle: string;
  did: string;
  adminBase: string;
  agentCardUrl: string;
  businessDomain?: string;
  cachedAt: string;
}

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export class HandleCacheStore {
  private readonly filePath: string;

  constructor(filePath = resolveDataPath(CACHE_FILE)) {
    this.filePath = filePath;
  }

  private readAll(): Record<string, HandleCacheRecord> {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, HandleCacheRecord>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeAll(records: Record<string, HandleCacheRecord>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  get(handle: string): HandleCacheRecord | null {
    const key = normalizeHandle(handle);
    const record = this.readAll()[key];
    if (!record) return null;
    const age = Date.now() - Date.parse(record.cachedAt);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;
    return record;
  }

  set(handle: string, resolved: ResolvedDiscoverTarget, businessDomain?: string): void {
    const key = normalizeHandle(handle);
    const all = this.readAll();
    all[key] = {
      handle: key,
      did: resolved.did,
      adminBase: resolved.adminBase,
      agentCardUrl: resolved.agentCardUrl,
      businessDomain: businessDomain?.trim() || undefined,
      cachedAt: new Date().toISOString(),
    };
    this.writeAll(all);
  }
}

export async function verifyCachedHandle(record: HandleCacheRecord): Promise<ResolvedDiscoverTarget | null> {
  try {
    const resp = await fetch(`${record.adminBase.replace(/\/$/, "")}/discover/capabilities`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { did?: string; publicBaseUrl?: string; agentCardUrl?: string };
    if (!body.did?.trim() || body.did.trim() !== record.did) return null;
    const adminBase = (body.publicBaseUrl ?? record.adminBase).replace(/\/$/, "");
    return {
      adminBase,
      agentCardUrl: body.agentCardUrl?.trim() || record.agentCardUrl,
      did: record.did,
      resolvedVia: "registry",
    };
  } catch {
    return null;
  }
}
