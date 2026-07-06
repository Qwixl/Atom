const STORAGE_KEY = "atom:pending-hosted-auth";

export type PendingHostedAuth = {
  kind: "register" | "login";
  email: string;
  handle?: string;
  llmApiKey?: string;
};

export function savePendingHostedAuth(data: PendingHostedAuth): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function loadPendingHostedAuth(): PendingHostedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingHostedAuth;
  } catch {
    return null;
  }
}

export function clearPendingHostedAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
