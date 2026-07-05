import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";

export const FIRST_RUN_DONE_KEY = "atom-first-run-done";

export function loadFirstRunDone(): boolean {
  const raw = loadStringFromStorage(FIRST_RUN_DONE_KEY);
  return raw === "1" || raw === "true";
}

export function markFirstRunDone(): void {
  saveStringToStorage(FIRST_RUN_DONE_KEY, "1");
}
