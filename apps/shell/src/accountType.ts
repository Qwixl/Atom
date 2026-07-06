import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";
import type { AtomAccountType } from "./auth/hostedAccount.js";

const ACCOUNT_TYPE_KEY = "atom-account-type";

export function saveAccountType(type: AtomAccountType): void {
  saveStringToStorage(ACCOUNT_TYPE_KEY, type);
}

export function loadAccountType(): AtomAccountType | undefined {
  const value = loadStringFromStorage(ACCOUNT_TYPE_KEY)?.trim();
  if (value === "user" || value === "business" || value === "developer") return value;
  return undefined;
}

export function clearAccountType(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACCOUNT_TYPE_KEY);
  }
}
