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

async function custodyFetch<T>(
  config: CommsAgentConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = config.adminUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.adminToken?.trim()) {
    headers.Authorization = `Bearer ${config.adminToken.trim()}`;
  }
  const resp = await fetch(`${base}${path}`, { ...init, headers });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Custody request failed (${resp.status})`);
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
