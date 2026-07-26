import { CommsAgentClient } from "../comms/client.js";
import type { AgentContact } from "../comms/types.js";
import { productionFetchUrl, resolveInjectedUrl } from "../productionGuard.js";
import { agentJsonRpcEndpoint, resolveAgentDeliveryBase } from "../comms/agentDeliveryUrl.js";
import {
  markDemoSessionActive,
  saveDemoSessionConfig,
  saveDemoSessionContacts,
  saveDemoSessionPeerConfig,
  saveDemoSessionPeerContacts,
  saveDemoSessionRole,
  saveDemoSessionDeliveryUrl,
} from "../demo/demoSessionStorage.js";

export function demoPeerAdminUrl(): string {
  return resolveInjectedUrl(import.meta.env.VITE_DEMO_PEER_URL as string, "http://127.0.0.1:5205");
}

export const DEMO_PEER_TOKEN =
  (import.meta.env.VITE_DEMO_PEER_TOKEN as string | undefined)?.trim() ?? "atom-demo-peer-token";

export async function fetchDemoPeerDid(adminBase: string): Promise<string> {
  const resp = await fetch(`${adminBase.replace(/\/$/, "")}/mls/key-package`);
  if (!resp.ok) throw new Error(`Demo peer not reachable (${resp.status})`);
  const body = (await resp.json()) as { did?: string };
  if (!body.did?.trim()) throw new Error("Demo peer returned no DID");
  return body.did.trim();
}

export async function checkAgentHealth(url: string, token: string): Promise<boolean> {
  if (!url || !token) return false;
  try {
    const client = new CommsAgentClient(url.replace(/\/$/, ""), token);
    const health = await client.health();
    return health.ok === true;
  } catch {
    return false;
  }
}

async function requestDemoSchedulingProposal(personalAdmin: string, personalToken: string): Promise<void> {
  const client = new CommsAgentClient(personalAdmin.replace(/\/$/, ""), personalToken);
  const health = await client.health();
  const peerUrl = productionFetchUrl(demoPeerAdminUrl());
  if (!peerUrl) return;
  const resp = await fetch(`${peerUrl}/demo/resend-proposal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEMO_PEER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ peerDid: health.did }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Demo proposal failed (${resp.status})`);
  }
}

export async function connectDemoPeerSession(input: {
  personalAdminUrl: string;
  personalToken: string;
}): Promise<void> {
  const personalAdmin = input.personalAdminUrl.replace(/\/$/, "");
  const token = input.personalToken.trim();
  if (!personalAdmin || !token) {
    throw new Error("Agent connection is not ready yet.");
  }
  if (personalAdmin === demoPeerAdminUrl().replace(/\/$/, "")) {
    throw new Error("Personal agent URL cannot be the demo peer URL.");
  }

  const demoDid = await fetchDemoPeerDid(demoPeerAdminUrl());
  const demoEndpoint = `${demoPeerAdminUrl().replace(/\/$/, "")}/a2a/jsonrpc`;

  saveDemoSessionConfig({ adminUrl: personalAdmin, adminToken: token });
  saveDemoSessionDeliveryUrl(resolveAgentDeliveryBase(personalAdmin));
  saveDemoSessionPeerConfig({ adminUrl: demoPeerAdminUrl(), adminToken: DEMO_PEER_TOKEN });
  saveDemoSessionRole("alice");

  const contact: AgentContact = {
    id: crypto.randomUUID(),
    did: demoDid,
    name: "Qwixl demo peer",
    endpoint: demoEndpoint,
    connectedAt: new Date().toISOString(),
  };
  saveDemoSessionContacts([contact]);

  const client = new CommsAgentClient(personalAdmin, token);
  const health = await client.health();
  const personalEndpoint = agentJsonRpcEndpoint(personalAdmin);
  saveDemoSessionPeerContacts([
    {
      id: crypto.randomUUID(),
      did: health.did,
      name: "Alice",
      endpoint: personalEndpoint,
      connectedAt: new Date().toISOString(),
    },
  ]);

  await client.connectPeer(demoEndpoint, demoDid);
  await requestDemoSchedulingProposal(personalAdmin, token);

  markDemoSessionActive();

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("atom-open-comms", "1");
  }
}
