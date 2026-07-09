import { loadJsonFromStorage, saveJsonToStorage } from "@qwixl/shell-core";

const FRIEND_REQUESTS_KEY = "atom-friend-requests";

export type FriendRequestStatus = "outgoing" | "incoming" | "accepted" | "declined";

export type FriendRequest = {
  id: string;
  fromDid: string;
  fromName: string;
  fromEndpoint?: string;
  toDid: string;
  toName?: string;
  toEndpoint?: string;
  roomId?: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
};

type Store = { requests: FriendRequest[] };

function readStore(): Store {
  const raw = loadJsonFromStorage<Store>(FRIEND_REQUESTS_KEY);
  if (!raw || !Array.isArray(raw.requests)) return { requests: [] };
  return { requests: raw.requests };
}

function writeStore(store: Store) {
  saveJsonToStorage(FRIEND_REQUESTS_KEY, store);
}

export function listFriendRequests(): FriendRequest[] {
  return readStore().requests;
}

export function listIncomingFriendRequests(localDid: string): FriendRequest[] {
  return listFriendRequests().filter((r) => r.toDid === localDid && r.status === "incoming");
}

export function listOutgoingFriendRequests(localDid: string): FriendRequest[] {
  return listFriendRequests().filter((r) => r.fromDid === localDid && r.status === "outgoing");
}

export function findPendingBetween(aDid: string, bDid: string): FriendRequest | undefined {
  return listFriendRequests().find(
    (r) =>
      (r.status === "outgoing" || r.status === "incoming") &&
      ((r.fromDid === aDid && r.toDid === bDid) || (r.fromDid === bDid && r.toDid === aDid)),
  );
}

export function upsertFriendRequest(request: FriendRequest): FriendRequest[] {
  const store = readStore();
  const next = [...store.requests.filter((r) => r.id !== request.id), request];
  writeStore({ requests: next });
  return next;
}

export function createOutgoingFriendRequest(opts: {
  fromDid: string;
  fromName: string;
  fromEndpoint?: string;
  toDid: string;
  toName?: string;
  toEndpoint?: string;
  roomId?: string;
}): FriendRequest {
  const existing = findPendingBetween(opts.fromDid, opts.toDid);
  if (existing) return existing;
  const now = new Date().toISOString();
  const request: FriendRequest = {
    id: `fr:${opts.fromDid}:${opts.toDid}:${Date.now()}`,
    fromDid: opts.fromDid,
    fromName: opts.fromName,
    fromEndpoint: opts.fromEndpoint,
    toDid: opts.toDid,
    toName: opts.toName,
    toEndpoint: opts.toEndpoint,
    roomId: opts.roomId,
    status: "outgoing",
    createdAt: now,
    updatedAt: now,
  };
  upsertFriendRequest(request);
  return request;
}

export function ingestIncomingFriendRequest(opts: {
  id?: string;
  fromDid: string;
  fromName: string;
  fromEndpoint?: string;
  toDid: string;
  roomId?: string;
}): FriendRequest {
  const existing = findPendingBetween(opts.fromDid, opts.toDid);
  if (existing) {
    if (existing.status === "outgoing" && existing.fromDid === opts.toDid) {
      // They already sent us one — treat as mutual pending on our side as incoming.
    } else {
      return existing;
    }
  }
  const now = new Date().toISOString();
  const request: FriendRequest = {
    id: opts.id ?? `fr:${opts.fromDid}:${opts.toDid}:${Date.now()}`,
    fromDid: opts.fromDid,
    fromName: opts.fromName,
    fromEndpoint: opts.fromEndpoint,
    toDid: opts.toDid,
    roomId: opts.roomId,
    status: "incoming",
    createdAt: now,
    updatedAt: now,
  };
  upsertFriendRequest(request);
  return request;
}

export function updateFriendRequestStatus(
  id: string,
  status: FriendRequestStatus,
): FriendRequest | null {
  const store = readStore();
  const current = store.requests.find((r) => r.id === id);
  if (!current) return null;
  const next = { ...current, status, updatedAt: new Date().toISOString() };
  upsertFriendRequest(next);
  return next;
}
