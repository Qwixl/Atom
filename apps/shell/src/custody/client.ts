import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { ConsequentialAction } from "@qwixl/shell-core";
import type { CommsAgentConfig } from "../comms/types.js";
import { formatAgentError } from "../comms/agentErrors.js";
import { getChatSessionToken } from "../comms/chatSessionToken.js";

function custodyBearer(config: CommsAgentConfig): string | undefined {
  return getChatSessionToken()?.trim() || config.adminToken?.trim() || undefined;
}

async function custodyFetch<T>(
  config: CommsAgentConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = config.adminUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const bearer = custodyBearer(config);
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const resp = await fetch(`${base}${path}`, { ...init, headers });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      formatAgentError(new Error(body.error ?? `Custody request failed (${resp.status})`)),
    );
  }
  return resp.json() as Promise<T>;
}

export interface CustodyStatus {
  vaultReady: boolean;
  passkeyRegistered: boolean;
  vaultOnlyCustody: boolean;
}

export async function fetchCustodyStatus(config: CommsAgentConfig): Promise<CustodyStatus> {
  return custodyFetch(config, "/custody/status");
}

export async function registerPasskey(config: CommsAgentConfig): Promise<void> {
  const { options, origin } = await custodyFetch<{
    options: PublicKeyCredentialCreationOptionsJSON;
    origin: string;
  }>(config, "/custody/webauthn/registration/options", { method: "POST", body: "{}" });
  const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: options });
  await custodyFetch(config, "/custody/webauthn/registration/verify", {
    method: "POST",
    body: JSON.stringify({ response, challenge: options.challenge }),
  });
  if (window.location.origin !== origin) {
    console.warn("[custody] WebAuthn origin mismatch during registration");
  }
}

export async function verifyCustodyApproval(
  config: CommsAgentConfig,
  action: ConsequentialAction,
): Promise<{ approvalRef: string }> {
  const begin = await custodyFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    origin: string;
    actionId: string;
    actionHash: string;
  }>(config, "/custody/approval/options", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  const response: AuthenticationResponseJSON = await startAuthentication({
    optionsJSON: begin.options,
  });
  const result = await custodyFetch<{ approved: boolean; approvalRef: string }>(
    config,
    "/custody/approval/verify",
    {
      method: "POST",
      body: JSON.stringify({
        actionId: begin.actionId,
        actionHash: begin.actionHash,
        response,
        challenge: begin.options.challenge,
      }),
    },
  );
  if (!result.approved) {
    throw new Error("Passkey approval failed");
  }
  return { approvalRef: result.approvalRef };
}

export async function loadOwnerRecords<T>(config: CommsAgentConfig): Promise<T[]> {
  const body = await custodyFetch<{ records: T[] }>(config, "/custody/store/records");
  return body.records ?? [];
}

export async function saveOwnerRecords<T>(
  config: CommsAgentConfig,
  records: readonly T[],
): Promise<void> {
  await custodyFetch(config, "/custody/store/records", {
    method: "PUT",
    body: JSON.stringify({ records: [...records] }),
  });
}

export async function loadOwnerProposals<T>(config: CommsAgentConfig): Promise<T[]> {
  const body = await custodyFetch<{ proposals: T[] }>(config, "/custody/store/proposals");
  return body.proposals ?? [];
}

export async function saveOwnerProposals<T>(
  config: CommsAgentConfig,
  proposals: readonly T[],
): Promise<void> {
  await custodyFetch(config, "/custody/store/proposals", {
    method: "PUT",
    body: JSON.stringify({ proposals: [...proposals] }),
  });
}

export async function loadAttestations<T>(config: CommsAgentConfig): Promise<T[]> {
  const body = await custodyFetch<{ entries: T[] }>(config, "/custody/store/attestations");
  return body.entries ?? [];
}

export async function saveAttestations<T>(
  config: CommsAgentConfig,
  entries: readonly T[],
): Promise<void> {
  await custodyFetch(config, "/custody/store/attestations", {
    method: "PUT",
    body: JSON.stringify({ entries: [...entries] }),
  });
}

export async function loadChatFeed(
  config: CommsAgentConfig,
  workspaceId = "personal",
): Promise<unknown | null> {
  const qs = new URLSearchParams({ workspaceId });
  const body = await custodyFetch<{ feed: unknown | null }>(
    config,
    `/custody/store/chat-feed?${qs.toString()}`,
  );
  return body.feed ?? null;
}

export async function saveChatFeed(
  config: CommsAgentConfig,
  workspaceId: string,
  feed: unknown,
): Promise<void> {
  await custodyFetch(config, "/custody/store/chat-feed", {
    method: "PUT",
    body: JSON.stringify({ workspaceId, feed }),
  });
}

export type StandingIntentKind = "daily-briefing" | "reminder" | "watch";

export type StandingIntentTrigger =
  | { type: "daily-time"; time: string; timezone?: string }
  | { type: "at"; at: string }
  | { type: "interval"; everyMinutes: number };

export interface StandingIntent {
  id: string;
  kind: StandingIntentKind;
  enabled: boolean;
  title: string;
  trigger: StandingIntentTrigger;
  scope?: { topics?: string[]; connectorIds?: string[]; query?: string };
  delivery?: {
    channel?: "inbox" | "chat" | "push";
    quietHours?: { start: string; end: string };
  };
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrainStatus {
  ok: boolean;
  running: boolean;
  alwaysOn: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastFireCount: number;
  intentCount: number;
  pendingCount: number;
}

export async function loadBrainIntents(config: CommsAgentConfig): Promise<StandingIntent[]> {
  const body = await custodyFetch<{ intents: StandingIntent[] }>(config, "/brain/intents");
  return Array.isArray(body.intents) ? body.intents : [];
}

export async function saveBrainIntents(
  config: CommsAgentConfig,
  intents: StandingIntent[],
): Promise<StandingIntent[]> {
  const body = await custodyFetch<{ ok: boolean; intents: StandingIntent[] }>(
    config,
    "/brain/intents",
    {
      method: "PUT",
      body: JSON.stringify({ intents }),
    },
  );
  return Array.isArray(body.intents) ? body.intents : intents;
}

export async function loadBrainStatus(config: CommsAgentConfig): Promise<BrainStatus | null> {
  try {
    return await custodyFetch<BrainStatus>(config, "/brain/status");
  } catch {
    return null;
  }
}

export interface BrainPendingNotification {
  id: string;
  intentId: string;
  kind: StandingIntentKind;
  title: string;
  body: string;
  createdAt: string;
  deliveredAt?: string | null;
}

export async function loadBrainPending(
  config: CommsAgentConfig,
  undeliveredOnly = true,
): Promise<BrainPendingNotification[]> {
  const qs = undeliveredOnly ? "?undelivered=1" : "";
  const body = await custodyFetch<{ notifications: BrainPendingNotification[] }>(
    config,
    `/brain/pending${qs}`,
  );
  return Array.isArray(body.notifications) ? body.notifications : [];
}

export async function markBrainNotificationsDelivered(
  config: CommsAgentConfig,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await custodyFetch(config, "/brain/pending/delivered", {
    method: "POST",
    body: JSON.stringify({ ids: [...ids] }),
  });
}

export function newStandingIntentId(): string {
  return `intent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface PushSubscriptionStatus {
  ok: boolean;
  vapidPublicKey: string | null;
  webPushConfigured: boolean;
  fcmConfigured: boolean;
  subscriptions: unknown[];
}

export async function loadPushSubscriptionStatus(
  config: CommsAgentConfig,
): Promise<PushSubscriptionStatus> {
  return custodyFetch<PushSubscriptionStatus>(config, "/brain/push-subscription");
}

export async function putPushSubscription(
  config: CommsAgentConfig,
  subscription: {
    kind: "web-push" | "fcm";
    endpoint: string;
    keys?: { p256dh: string; auth: string };
    userAgent?: string;
  },
): Promise<void> {
  await custodyFetch(config, "/brain/push-subscription", {
    method: "PUT",
    body: JSON.stringify({ subscription }),
  });
}

export async function deletePushSubscription(
  config: CommsAgentConfig,
  endpoint: string,
): Promise<void> {
  await custodyFetch(config, "/brain/push-subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

