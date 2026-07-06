import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";

const OWNER_HANDLE_KEY = "atom-owner-handle";

export function normalizeOwnerHandle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

/** Bare handle without @ — control-plane storage format. */
export function bareOwnerHandle(input: string): string {
  return normalizeOwnerHandle(input).replace(/^@/, "");
}

export function validateOwnerHandle(input: string): string | null {
  const bare = bareOwnerHandle(input);
  if (!bare) return "Choose a handle.";
  if (!/^[a-z0-9][a-z0-9-]{1,22}$/.test(bare)) {
    return "Use 2–24 characters: letters, numbers, or hyphens (shown as @handle).";
  }
  return null;
}

export function saveOwnerHandle(handle: string): void {
  saveStringToStorage(OWNER_HANDLE_KEY, normalizeOwnerHandle(handle));
}

export function loadOwnerHandle(): string | undefined {
  const value = loadStringFromStorage(OWNER_HANDLE_KEY)?.trim();
  return value ? normalizeOwnerHandle(value) : undefined;
}

/** Display name for room chat — prefers @handle over raw DID. */
export function ownerHandleForRooms(): string {
  return loadOwnerHandle() ?? "Guest";
}

export function formatRoomMemberLabel(
  member: { did: string; name?: string },
  localDid: string | null,
  ownerHandle?: string,
): string {
  const handle = ownerHandle ?? loadOwnerHandle();
  if (localDid && member.did === localDid && handle) return handle;
  const name = member.name?.trim();
  if (name && name.startsWith("@")) return name;
  if (name && name !== "Guest") return name;
  if (name) return name;
  return member.did.length > 16 ? `${member.did.slice(0, 10)}…` : member.did;
}

export function formatRoomSenderLabel(
  senderDid: string,
  members: Array<{ did: string; name?: string }>,
  localDid: string | null,
  ownerHandle?: string,
): string {
  const member = members.find((row) => row.did === senderDid);
  if (member) return formatRoomMemberLabel(member, localDid, ownerHandle);
  if (localDid && senderDid === localDid) return ownerHandle ?? loadOwnerHandle() ?? "You";
  return senderDid.length > 16 ? `${senderDid.slice(0, 10)}…` : senderDid;
}
