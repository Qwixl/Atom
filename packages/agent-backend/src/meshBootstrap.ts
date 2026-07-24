/**
 * Owner-agent mesh bootstrap: auto MLS-connect to peer owners + swarm NPCs.
 * Police / swarm-police are never included.
 */
import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import { connectMlsPeer } from "./mlsReconnect.js";
import { normalizePeerBaseUrl } from "./deliverObject.js";

export type MeshBootstrapIndexEntry = {
  agentKind?: string;
  handle?: string;
  id?: string;
  hostUrl?: string;
  publicBaseUrl?: string;
  agentCardUrl?: string;
  agentUrl?: string;
};

export type MeshBootstrapResult = {
  attempted: number;
  connected: string[];
  skipped: string[];
  failed: { peerUrl: string; error: string }[];
};

const POLICE_KIND = "swarm-police";
const DEFAULT_INDEX_URL = "https://atom.qwixl.com/app/community-index/index.json";

/** True when a listing/URL should stay out of the general talk mesh. */
export function isExcludedFromMesh(entry: {
  agentKind?: string;
  handle?: string;
  id?: string;
  url?: string;
}): boolean {
  const kind = entry.agentKind?.trim().toLowerCase();
  if (kind === POLICE_KIND || kind === "police") return true;
  const handle = (entry.handle ?? "").replace(/^@/, "").toLowerCase();
  const id = (entry.id ?? "").toLowerCase();
  if (handle.includes("police") || id.includes("police")) return true;
  const url = (entry.url ?? "").toLowerCase();
  if (!url) return false;
  if (url.includes("police")) return true;
  // Default Optimus police fabric port.
  if (/:\/\/5499\.|:5499(?:\/|$)/.test(url)) return true;
  return false;
}

export function parseMeshPeerUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const normalized = normalizePeerUrlForConnect(trimmed);
    if (isExcludedFromMesh({ url: normalized })) continue;
    const key = normalizePeerBaseUrl(normalized).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function normalizePeerUrlForConnect(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (/\/a2a\/jsonrpc$/i.test(trimmed)) return trimmed;
  return `${trimmed}/a2a/jsonrpc`;
}

/** Extract mesh peer A2A URLs from community / discover index JSON. */
export function peerUrlsFromMeshIndex(payload: unknown): string[] {
  const entries: MeshBootstrapIndexEntry[] = [];
  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (row && typeof row === "object") entries.push(row as MeshBootstrapIndexEntry);
    }
  } else if (payload && typeof payload === "object") {
    const root = payload as { businesses?: unknown[]; entries?: unknown[] };
    for (const key of ["businesses", "entries"] as const) {
      const list = root[key];
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (row && typeof row === "object") entries.push(row as MeshBootstrapIndexEntry);
      }
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const kind = entry.agentKind?.trim().toLowerCase();
    // Community index: only labeled swarm NPCs. Seed index: same.
    // Skip unlabeled community hosts (coffee shop) — owners opt in via ATOM_MESH_PEER_URLS.
    if (kind !== "swarm-npc" && kind !== "npc") continue;
    if (isExcludedFromMesh(entry)) continue;
    const base =
      entry.agentCardUrl?.trim() ||
      entry.hostUrl?.trim() ||
      entry.publicBaseUrl?.trim() ||
      entry.agentUrl?.trim() ||
      "";
    if (!base) continue;
    const peerUrl = normalizePeerUrlForConnect(base);
    if (isExcludedFromMesh({ ...entry, url: peerUrl })) continue;
    const key = normalizePeerBaseUrl(peerUrl).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(peerUrl);
  }
  return out;
}

export function meshBootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.ATOM_MESH_BOOTSTRAP?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  // Enable when peer URLs or an index URL are explicitly configured.
  return Boolean(
    env.ATOM_MESH_PEER_URLS?.trim() || env.ATOM_MESH_BOOTSTRAP_INDEX_URL?.trim(),
  );
}

export function resolveMeshBootstrapIndexUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.ATOM_MESH_BOOTSTRAP_INDEX_URL?.trim();
  if (explicit) return explicit;
  const flag = env.ATOM_MESH_BOOTSTRAP?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return DEFAULT_INDEX_URL;
  return null;
}

export async function resolveMeshPeerUrls(opts: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  selfBaseUrl?: string;
}): Promise<string[]> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (url: string) => {
    if (isExcludedFromMesh({ url })) return;
    const key = normalizePeerBaseUrl(url).toLowerCase();
    if (seen.has(key)) return;
    if (opts.selfBaseUrl) {
      const selfKey = normalizePeerBaseUrl(opts.selfBaseUrl).toLowerCase();
      if (key === selfKey) return;
    }
    seen.add(key);
    out.push(url);
  };

  for (const url of parseMeshPeerUrls(env.ATOM_MESH_PEER_URLS)) {
    add(url);
  }

  const indexUrl = resolveMeshBootstrapIndexUrl(env);
  if (indexUrl) {
    try {
      const resp = await fetchImpl(indexUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.ok) {
        const payload = (await resp.json()) as unknown;
        for (const url of peerUrlsFromMeshIndex(payload)) {
          add(url);
        }
      }
    } catch {
      /* index optional — explicit peer URLs still apply */
    }
  }

  return out;
}

export async function bootstrapMeshPeers(opts: {
  mlsStore: MlsSessionStore;
  peerRecords: MlsPeerRecordStore;
  localDid: string;
  publicBaseUrl: string;
  peerUrls?: string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  initiatorEndpoint?: string;
}): Promise<MeshBootstrapResult> {
  const peerUrls =
    opts.peerUrls ??
    (await resolveMeshPeerUrls({
      env: opts.env,
      fetchImpl: opts.fetchImpl,
      selfBaseUrl: opts.publicBaseUrl,
    }));

  const connected: string[] = [];
  const skipped: string[] = [];
  const failed: { peerUrl: string; error: string }[] = [];
  const initiatorEndpoint =
    opts.initiatorEndpoint ??
    `${opts.publicBaseUrl.replace(/\/$/, "")}/a2a/jsonrpc`;

  for (const peerUrl of peerUrls) {
    if (isExcludedFromMesh({ url: peerUrl })) {
      skipped.push(peerUrl);
      continue;
    }
    try {
      const result = await connectMlsPeer({
        mlsStore: opts.mlsStore,
        peerRecords: opts.peerRecords,
        localDid: opts.localDid,
        peerUrl,
        initiatorEndpoint,
      });
      connected.push(result.connected);
    } catch (error) {
      failed.push({
        peerUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { attempted: peerUrls.length, connected, skipped, failed };
}
