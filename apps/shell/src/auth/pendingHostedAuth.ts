const STORAGE_KEY = "atom:pending-hosted-auth";
const AT_PROVISION_KEY = "atom:signup-at-provision";

export type PendingHostedAuth = {
  kind: "register" | "login";
  email: string;
  handle?: string;
  llmApiKey?: string;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
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

export function markSignupAtProvision(): void {
  try {
    sessionStorage.setItem(AT_PROVISION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSignupAtProvision(): void {
  try {
    sessionStorage.removeItem(AT_PROVISION_KEY);
  } catch {
    /* ignore */
  }
}

export function isSignupAtProvision(): boolean {
  try {
    return sessionStorage.getItem(AT_PROVISION_KEY) === "1";
  } catch {
    return false;
  }
}
