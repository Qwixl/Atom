export interface HandleIndexEntry {
  handle: string;
  agentDid: string;
  adminBase?: string;
  agentCardUrl?: string;
  businessDomain?: string;
  moduleIds?: string[];
  roomIds?: string[];
}

export interface HandleIndexDocument {
  version: number;
  updatedAt: string;
  entries: HandleIndexEntry[];
}

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export function parseHandleIndex(raw: unknown): HandleIndexDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as HandleIndexDocument;
  if (!Array.isArray(doc.entries)) return null;
  return {
    version: typeof doc.version === "number" ? doc.version : 1,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : new Date().toISOString(),
    entries: doc.entries.filter(
      (entry) => typeof entry.handle === "string" && typeof entry.agentDid === "string",
    ),
  };
}

export function lookupHandleIndex(doc: HandleIndexDocument, handle: string): HandleIndexEntry | null {
  const key = normalizeHandle(handle);
  return doc.entries.find((entry) => normalizeHandle(entry.handle) === key) ?? null;
}

export async function fetchHandleIndex(indexUrl: string): Promise<HandleIndexDocument | null> {
  try {
    const response = await fetch(indexUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return parseHandleIndex((await response.json()) as unknown);
  } catch {
    return null;
  }
}
