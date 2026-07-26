import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";
import type { AtomAccountType } from "./auth/hostedAccount.js";

const ACCOUNT_TYPE_KEY = "atom-account-type";
const ACCOUNT_TYPES_KEY = "atom-account-types";

function isAtomAccountType(value: unknown): value is AtomAccountType {
  return value === "user" || value === "business" || value === "developer";
}

/** Persist primary account type and the full selection list (JSON). */
export function saveAccountType(
  type: AtomAccountType,
  accountTypes?: readonly AtomAccountType[],
): void {
  saveStringToStorage(ACCOUNT_TYPE_KEY, type);
  const types = accountTypes && accountTypes.length > 0 ? [...accountTypes] : [type];
  saveStringToStorage(ACCOUNT_TYPES_KEY, JSON.stringify(types));
}

export function loadAccountType(): AtomAccountType | undefined {
  const value = loadStringFromStorage(ACCOUNT_TYPE_KEY)?.trim();
  if (isAtomAccountType(value)) return value;
  return undefined;
}

export function loadAccountTypes(): AtomAccountType[] | undefined {
  const raw = loadStringFromStorage(ACCOUNT_TYPES_KEY)?.trim();
  if (!raw) {
    const primary = loadAccountType();
    return primary ? [primary] : undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const types = parsed.filter(isAtomAccountType);
    return types.length > 0 ? types : undefined;
  } catch {
    return undefined;
  }
}

export function clearAccountType(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACCOUNT_TYPE_KEY);
    localStorage.removeItem(ACCOUNT_TYPES_KEY);
  }
}
