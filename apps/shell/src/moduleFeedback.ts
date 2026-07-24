/** Client helpers for control-plane module feedback, module abuse, and comms abuse (M-TS-04/08/11). */

import { controlPlaneBaseUrl } from "./hostConfig.js";
import { supabaseAccessToken } from "./auth/hostedAccount.js";

export type ModuleAbuseCategory =
  | "malware"
  | "phishing"
  | "prohibited-content"
  | "privacy"
  | "spam"
  | "other";

export const MODULE_ABUSE_CATEGORIES: Array<{ id: ModuleAbuseCategory; label: string }> = [
  { id: "malware", label: "Malware / exploit" },
  { id: "phishing", label: "Phishing / social engineering" },
  { id: "prohibited-content", label: "Prohibited content" },
  { id: "privacy", label: "Privacy violation" },
  { id: "spam", label: "Spam / deceptive listing" },
  { id: "other", label: "Other" },
];

export type CommsAbuseCategory =
  | "harassment"
  | "spam"
  | "scam"
  | "illegal-content"
  | "csam"
  | "impersonation"
  | "other";

export const COMMS_ABUSE_CATEGORIES: Array<{ id: CommsAbuseCategory; label: string }> = [
  { id: "harassment", label: "Harassment / threats" },
  { id: "spam", label: "Spam / unsolicited bulk" },
  { id: "scam", label: "Scam / fraud" },
  { id: "illegal-content", label: "Illegal goods or services" },
  { id: "csam", label: "CSAM / sexual abuse material" },
  { id: "impersonation", label: "Impersonation" },
  { id: "other", label: "Other" },
];

const DETAILS_MAX = 2000;
const ID_MAX = 200;

async function postControlPlaneJson(path: string, body: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await supabaseAccessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${controlPlaneBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Request failed (${response.status})`);
  }
}

export async function submitModuleFeedback(opts: {
  moduleId: string;
  version: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  const rating = Math.round(opts.rating);
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }
  await postControlPlaneJson("/module-feedback", {
    moduleId: opts.moduleId.trim().slice(0, ID_MAX),
    version: opts.version.trim().slice(0, ID_MAX),
    rating,
    comment: opts.comment?.trim().slice(0, DETAILS_MAX) || undefined,
  });
}

export async function submitModuleAbuseReport(opts: {
  moduleId: string;
  version: string;
  category: ModuleAbuseCategory;
  details?: string;
  publisher?: string;
}): Promise<void> {
  const moduleId = opts.moduleId.trim();
  const version = opts.version.trim();
  if (!moduleId || !version) {
    throw new Error("moduleId and version required");
  }
  if (!MODULE_ABUSE_CATEGORIES.some((entry) => entry.id === opts.category)) {
    throw new Error("Invalid abuse category");
  }
  await postControlPlaneJson("/module-abuse-report", {
    moduleId: moduleId.slice(0, ID_MAX),
    version: version.slice(0, ID_MAX),
    category: opts.category,
    details: opts.details?.trim().slice(0, DETAILS_MAX) || undefined,
    publisher: opts.publisher?.trim().slice(0, ID_MAX) || undefined,
  });
}

/** M-TS-08: report a peer contact / room member. Does not include MLS plaintext. */
export async function submitCommsAbuseReport(opts: {
  peerDid: string;
  category: CommsAbuseCategory;
  details?: string;
  peerEndpoint?: string;
  peerHandle?: string;
  peerName?: string;
  roomId?: string;
  alsoBlock?: boolean;
  surface?: "chat" | "messages" | "rooms" | "modules" | "other";
}): Promise<void> {
  const peerDid = opts.peerDid.trim();
  if (!peerDid) {
    throw new Error("peerDid required");
  }
  if (!COMMS_ABUSE_CATEGORIES.some((entry) => entry.id === opts.category)) {
    throw new Error("Invalid abuse category");
  }
  await postControlPlaneJson("/comms-abuse-report", {
    peerDid: peerDid.slice(0, ID_MAX),
    category: opts.category,
    details: opts.details?.trim().slice(0, DETAILS_MAX) || undefined,
    peerEndpoint: opts.peerEndpoint?.trim().slice(0, 500) || undefined,
    peerHandle: opts.peerHandle?.trim().slice(0, 120) || undefined,
    peerName: opts.peerName?.trim().slice(0, 120) || undefined,
    roomId: opts.roomId?.trim().slice(0, ID_MAX) || undefined,
    alsoBlock: opts.alsoBlock === true,
    surface: opts.surface ?? (opts.roomId ? "rooms" : "messages"),
  });

  const peerEndpoint = opts.peerEndpoint?.trim();
  if (peerEndpoint && /agents\.qwixl\.(dev|com)|hosted/i.test(peerEndpoint)) {
    await fetch(`${controlPlaneBaseUrl()}/report-abuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentUrl: peerEndpoint.slice(0, 500),
        reason: `comms:${opts.category}${opts.details?.trim() ? ` — ${opts.details.trim().slice(0, 400)}` : ""}`,
      }),
    }).catch(() => {
      /* host-agent escalate is best-effort after peer report succeeds */
    });
  }
}
