import type { BusinessIndexEntry } from "@qwixl/business-index";
import type { AgentBackendConfig } from "./config.js";
import { COFFEE_SHOP_ROOM_ID } from "./communityCoffeeShop.js";
import { HandleCacheStore, verifyCachedHandle } from "./handleCache.js";
import type { RoomStore } from "./roomStore.js";
import { adminBaseFromPeerUrl } from "./mlsSessions.js";

export interface AgentCapabilities {
  did: string;
  publicBaseUrl: string;
  agentCardUrl: string;
  moduleIds: string[];
  roomIds: string[];
  businessDomain?: string;
}

export interface ResolvedDiscoverTarget {
  adminBase: string;
  agentCardUrl: string;
  did: string;
  resolvedVia: "local" | "localhost-probe" | "registry" | "well-known" | "index-url";
}

const COFFEE_SHOP_MODULE_ID = "community/coffee-shop";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function agentCardFromBase(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/a2a/jsonrpc`;
}

function parseDevDiscoveryPorts(env: NodeJS.ProcessEnv = process.env): number[] {
  const raw = env.ATOM_DEV_DISCOVERY_PORTS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((port) => Number.isFinite(port) && port > 0);
  }
  return [5204, 5205, 5207, 5301, 5305];
}

export function buildAgentCapabilities(opts: {
  config: AgentBackendConfig;
  localDid: string;
  rooms: RoomStore;
  businessDomain?: string | null;
}): AgentCapabilities {
  const moduleIds: string[] = [];
  const roomIds = opts.rooms.listRooms().map((room) => room.roomId);
  for (const room of opts.rooms.listRooms()) {
    if (room.moduleId?.trim()) moduleIds.push(room.moduleId.trim());
  }
  if (opts.config.communityHostMode) {
    if (!moduleIds.includes(COFFEE_SHOP_MODULE_ID)) moduleIds.push(COFFEE_SHOP_MODULE_ID);
    if (!roomIds.includes(COFFEE_SHOP_ROOM_ID)) roomIds.push(COFFEE_SHOP_ROOM_ID);
  }
  return {
    did: opts.localDid,
    publicBaseUrl: normalizeBaseUrl(opts.config.publicBaseUrl),
    agentCardUrl: agentCardFromBase(opts.config.publicBaseUrl),
    moduleIds: [...new Set(moduleIds)],
    roomIds: [...new Set(roomIds)],
    businessDomain: opts.businessDomain?.trim() || undefined,
  };
}

async function fetchCapabilities(baseUrl: string, timeoutMs = 1500): Promise<AgentCapabilities | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${normalizeBaseUrl(baseUrl)}/discover/capabilities`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as Partial<AgentCapabilities>;
    if (!body.did?.trim() || !body.publicBaseUrl?.trim()) return null;
    return {
      did: body.did.trim(),
      publicBaseUrl: normalizeBaseUrl(body.publicBaseUrl),
      agentCardUrl: body.agentCardUrl?.trim() || agentCardFromBase(body.publicBaseUrl),
      moduleIds: body.moduleIds ?? [],
      roomIds: body.roomIds ?? [],
      businessDomain: body.businessDomain?.trim() || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function matchesDiscoverCapabilities(
  cap: AgentCapabilities,
  entry: BusinessIndexEntry,
): boolean {
  return matchesEntry(cap, entry);
}

function matchesEntry(cap: AgentCapabilities, entry: BusinessIndexEntry): boolean {
  if (entry.businessDomain?.trim() && cap.businessDomain === entry.businessDomain.trim()) return true;
  for (const moduleId of entry.moduleIds ?? []) {
    if (cap.moduleIds.includes(moduleId)) return true;
  }
  for (const roomId of entry.roomIds ?? []) {
    if (cap.roomIds.includes(roomId)) return true;
  }
  return false;
}

async function resolveViaLocalhostProbe(
  entry: BusinessIndexEntry,
  selfBaseUrl: string,
): Promise<ResolvedDiscoverTarget | null> {
  const selfBase = normalizeBaseUrl(selfBaseUrl);
  for (const port of parseDevDiscoveryPorts()) {
    const candidate = `http://127.0.0.1:${port}`;
    if (candidate === selfBase) continue;
    const cap = await fetchCapabilities(candidate);
    if (!cap || !matchesEntry(cap, entry)) continue;
    return {
      adminBase: cap.publicBaseUrl,
      agentCardUrl: cap.agentCardUrl,
      did: cap.did,
      resolvedVia: "localhost-probe",
    };
  }
  return null;
}

async function resolveViaWellKnown(businessDomain: string): Promise<ResolvedDiscoverTarget | null> {
  const domain = businessDomain.trim();
  if (!domain) return null;
  try {
    const resp = await fetch(`https://${domain}/.well-known/agent-card.json`);
    if (!resp.ok) return null;
    const card = (await resp.json()) as { url?: string };
    if (!card.url?.trim()) return null;
    const adminBase = adminBaseFromPeerUrl(card.url);
    const kpResp = await fetch(`${adminBase}/mls/key-package`);
    if (!kpResp.ok) return null;
    const kp = (await kpResp.json()) as { did?: string };
    if (!kp.did?.trim()) return null;
    return {
      adminBase,
      agentCardUrl: card.url.trim(),
      did: kp.did.trim(),
      resolvedVia: "well-known",
    };
  } catch {
    return null;
  }
}

async function resolveViaHostUrl(
  entry: BusinessIndexEntry,
  hostUrl: string,
): Promise<ResolvedDiscoverTarget | null> {
  const adminBase = normalizeBaseUrl(hostUrl);
  const cap = await fetchCapabilities(adminBase);
  if (!cap || !matchesEntry(cap, entry)) return null;
  return {
    adminBase: cap.publicBaseUrl,
    agentCardUrl: cap.agentCardUrl,
    did: cap.did,
    resolvedVia: "index-url",
  };
}

async function resolveViaConfiguredCommunityHost(
  entry: BusinessIndexEntry,
): Promise<ResolvedDiscoverTarget | null> {
  const configured = process.env.ATOM_COMMUNITY_HOST_URL?.trim();
  if (!configured) return null;
  const cap = await fetchCapabilities(configured);
  if (!cap || !matchesEntry(cap, entry)) return null;
  return {
    adminBase: cap.publicBaseUrl,
    agentCardUrl: cap.agentCardUrl,
    did: cap.did,
    resolvedVia: "registry",
  };
}

async function resolveViaIndexUrl(agentCardUrl: string): Promise<ResolvedDiscoverTarget | null> {
  const url = agentCardUrl.trim();
  if (!url) return null;
  try {
    const adminBase = adminBaseFromPeerUrl(url);
    const kpResp = await fetch(`${adminBase}/mls/key-package`);
    if (!kpResp.ok) return null;
    const kp = (await kpResp.json()) as { did?: string };
    if (!kp.did?.trim()) return null;
    return {
      adminBase,
      agentCardUrl: url,
      did: kp.did.trim(),
      resolvedVia: "index-url",
    };
  } catch {
    return null;
  }
}

export async function resolveDiscoverEntry(opts: {
  entry: BusinessIndexEntry;
  localCapabilities: AgentCapabilities;
  handleCache?: HandleCacheStore;
}): Promise<ResolvedDiscoverTarget> {
  const { entry, localCapabilities, handleCache } = opts;

  if (entry.handle?.trim() && handleCache) {
    const cached = handleCache.get(entry.handle);
    if (cached) {
      const verified = await verifyCachedHandle(cached);
      if (verified) return verified;
    }
  }

  if (matchesEntry(localCapabilities, entry)) {
    const resolved: ResolvedDiscoverTarget = {
      adminBase: localCapabilities.publicBaseUrl,
      agentCardUrl: localCapabilities.agentCardUrl,
      did: localCapabilities.did,
      resolvedVia: "local",
    };
    if (entry.handle?.trim() && handleCache) {
      handleCache.set(entry.handle, resolved, entry.businessDomain);
    }
    return resolved;
  }

  const probed = await resolveViaLocalhostProbe(entry, localCapabilities.publicBaseUrl);
  if (probed) {
    if (entry.handle?.trim() && handleCache) {
      handleCache.set(entry.handle, probed, entry.businessDomain);
    }
    return probed;
  }

  if (entry.hostUrl?.trim()) {
    const fromHost = await resolveViaHostUrl(entry, entry.hostUrl);
    if (fromHost) {
      if (entry.handle?.trim() && handleCache) {
        handleCache.set(entry.handle, fromHost, entry.businessDomain);
      }
      return fromHost;
    }
  }

  const configuredCommunity = await resolveViaConfiguredCommunityHost(entry);
  if (configuredCommunity) {
    if (entry.handle?.trim() && handleCache) {
      handleCache.set(entry.handle, configuredCommunity, entry.businessDomain);
    }
    return configuredCommunity;
  }

  if (entry.businessDomain?.trim()) {
    const wellKnown = await resolveViaWellKnown(entry.businessDomain);
    if (wellKnown) {
      if (entry.handle?.trim() && handleCache) {
        handleCache.set(entry.handle, wellKnown, entry.businessDomain);
      }
      return wellKnown;
    }
  }

  if (entry.agentCardUrl?.trim()) {
    const fromIndex = await resolveViaIndexUrl(entry.agentCardUrl);
    if (fromIndex) {
      if (entry.handle?.trim() && handleCache) {
        handleCache.set(entry.handle, fromIndex, entry.businessDomain);
      }
      return fromIndex;
    }
  }

  const hints = [
    entry.handle?.trim() ? `handle=${entry.handle.trim()}` : null,
    entry.moduleIds?.length ? `moduleIds=${entry.moduleIds.join(",")}` : null,
    entry.roomIds?.length ? `roomIds=${entry.roomIds.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  throw new Error(
    `Could not locate a running agent for ${entry.displayName}${hints ? ` (${hints})` : ""}. ` +
      `Start the host agent (e.g. enable ATOM_COMMUNITY_HOST=1 on your agent) or set ATOM_DEV_DISCOVERY_PORTS.`,
  );
}
