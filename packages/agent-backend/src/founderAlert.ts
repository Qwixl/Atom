/**
 * Class C alerts from Police-Agent → founder's Atom agent (D087 / AS-08).
 * Founder agent surfaces via brain pending / shell notify; founder replies, then actions.
 */

export interface FounderAlertPayload {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  npcDid?: string;
  proposedAction?: string;
  createdAt: string;
}

export interface FounderAlertConfig {
  founderAgentBaseUrl: string;
  founderAdminToken: string;
}

export function loadFounderAlertConfig(
  env: NodeJS.ProcessEnv = process.env,
): FounderAlertConfig | null {
  const founderAgentBaseUrl = env.ATOM_FOUNDER_AGENT_URL?.trim().replace(/\/$/, "") || "";
  const founderAdminToken = env.ATOM_FOUNDER_ADMIN_TOKEN?.trim() || "";
  if (!founderAgentBaseUrl || !founderAdminToken) return null;
  return { founderAgentBaseUrl, founderAdminToken };
}

/** POST Class C alert into founder's brain pending queue. */
export async function sendFounderAlert(
  config: FounderAlertConfig,
  alert: FounderAlertPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = `${config.founderAgentBaseUrl}/brain/pending/inject`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.founderAdminToken}`,
      },
      body: JSON.stringify({
        notification: {
          id: alert.id,
          intentId: `police-${alert.id}`,
          kind: "watch",
          title: `[Class C] ${alert.title}`,
          body: [
            alert.body,
            alert.npcDid ? `NPC: ${alert.npcDid}` : null,
            alert.proposedAction ? `Proposed: ${alert.proposedAction}` : null,
            `Severity: ${alert.severity}`,
          ]
            .filter(Boolean)
            .join("\n"),
          createdAt: alert.createdAt,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
