import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseServiceAccount(raw: unknown): FcmServiceAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const projectId = typeof obj.project_id === "string" ? obj.project_id.trim() : "";
  const clientEmail = typeof obj.client_email === "string" ? obj.client_email.trim() : "";
  const privateKey = typeof obj.private_key === "string" ? obj.private_key : "";
  if (!projectId || !clientEmail || !privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { projectId, clientEmail, privateKey };
}

/** Load FCM service account from env (JSON, base64 JSON, or file path). */
export function loadFcmServiceAccount(
  env: NodeJS.ProcessEnv = process.env,
): FcmServiceAccount | null {
  const b64 = env.ATOM_FCM_SERVICE_ACCOUNT_B64?.trim();
  if (b64) {
    try {
      return parseServiceAccount(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
    } catch {
      return null;
    }
  }

  const inline = env.ATOM_FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    try {
      return parseServiceAccount(JSON.parse(inline));
    } catch {
      return null;
    }
  }

  const path = env.ATOM_FCM_SERVICE_ACCOUNT_PATH?.trim();
  if (path) {
    try {
      return parseServiceAccount(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      return null;
    }
  }

  return null;
}

async function mintAccessToken(account: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const unsigned = `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson({
    iss: account.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.privateKey).toString("base64url")}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`FCM OAuth ${resp.status}: ${text.slice(0, 200)}`);
  }
  const body = (await resp.json()) as { access_token?: string; expires_in?: number };
  const accessToken = body.access_token?.trim();
  if (!accessToken) throw new Error("FCM OAuth response missing access_token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cachedToken = {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

/** Send a data+notification message via FCM HTTP v1. */
export async function sendFcmHttpV1(
  account: FcmServiceAccount,
  deviceToken: string,
  payload: { title: string; body: string; data: Record<string, string> },
): Promise<void> {
  const accessToken = await mintAccessToken(account);
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          android: {
            priority: "HIGH",
          },
        },
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`FCM HTTP v1 ${resp.status}: ${text.slice(0, 200)}`);
  }
}

/** Test helper — clear cached OAuth token between cases. */
export function resetFcmAccessTokenCacheForTests(): void {
  cachedToken = null;
}
