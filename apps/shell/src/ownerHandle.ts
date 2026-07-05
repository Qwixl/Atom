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
