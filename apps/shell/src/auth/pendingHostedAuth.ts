import type { AtomAccountType } from "./hostedAccount.js";
import type { BillingLane, ModelTierId, ReadinessSkuId } from "./planLanes.js";

const STORAGE_KEY = "atom:pending-hosted-auth";
const AT_PROVISION_KEY = "atom:signup-at-provision";
const PASSWORD_KEY = "atom:pending-signup-password";

export type PendingHostedAuth = {
  kind: "register" | "login";
  email: string;
  handle?: string;
  accountType?: AtomAccountType;
  accountTypes?: AtomAccountType[];
  llmApiKey?: string;
  llmProvider?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  billingLane?: BillingLane;
  readinessSkuId?: ReadinessSkuId;
  modelTierId?: ModelTierId;
  topUpPence?: number;
  /** SIGNUP-PAY-ORDER-01 — CP pending row (paid path only). */
  pendingSignupId?: string;
  emailVerifiedForPay?: boolean;
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
  clearPendingSignupPassword();
}

/** Password stays in sessionStorage until claim — never sent to CP until createUser. */
export function savePendingSignupPassword(password: string): void {
  try {
    sessionStorage.setItem(PASSWORD_KEY, password);
  } catch {
    /* ignore */
  }
}

export function loadPendingSignupPassword(): string | null {
  try {
    return sessionStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}

export function clearPendingSignupPassword(): void {
  try {
    sessionStorage.removeItem(PASSWORD_KEY);
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
