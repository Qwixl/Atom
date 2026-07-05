import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";
import { CommsAgentClient } from "./comms/client.js";
import { saveCommsAgentConfig } from "./comms/storage.js";
import type { AgentContact } from "./comms/types.js";
import type { CommsThreadItem } from "./comms/types.js";

export const IS_DEMO_MODE =
  import.meta.env.VITE_DEMO_MODE === "1" || import.meta.env.VITE_DEMO_MODE === "true";

export type DemoPersonaId = "alice" | "bob";

export type DemoPersona = {
  id: DemoPersonaId;
  label: string;
  adminUrl: string;
  adminToken: string;
  peerLabel: string;
};

const ALICE_URL =
  (import.meta.env.VITE_DEMO_ALICE_URL as string | undefined)?.replace(/\/$/, "") ??
  (import.meta.env.VITE_DEMO_PERSONAL_AGENT_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:5204";

const BOB_URL =
  (import.meta.env.VITE_DEMO_BOB_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:5206";

const ALICE_TOKEN =
  (import.meta.env.VITE_DEMO_ALICE_TOKEN as string | undefined)?.trim() ||
  (import.meta.env.VITE_DEMO_PERSONAL_AGENT_TOKEN as string | undefined)?.trim() ||
  "atom-demo-alice-token";

const BOB_TOKEN =
  (import.meta.env.VITE_DEMO_BOB_TOKEN as string | undefined)?.trim() ?? "atom-demo-bob-token";

export const DEMO_PERSONAS: Record<DemoPersonaId, DemoPersona> = {
  alice: {
    id: "alice",
    label: "Alice",
    adminUrl: ALICE_URL,
    adminToken: ALICE_TOKEN,
    peerLabel: "Bob",
  },
  bob: {
    id: "bob",
    label: "Bob",
    adminUrl: BOB_URL,
    adminToken: BOB_TOKEN,
    peerLabel: "Alice",
  },
};

const PERSONA_KEY = "atom-demo-persona";
const CONTACTS_PREFIX = "atom-demo-contacts-";
const BOOTSTRAP_KEY = "atom-demo-bootstrapped";

export function loadDemoPersona(): DemoPersonaId {
  const raw = loadStringFromStorage(PERSONA_KEY);
  return raw === "bob" ? "bob" : "alice";
}

export function saveDemoPersona(id: DemoPersonaId): void {
  saveStringToStorage(PERSONA_KEY, id);
}

export function isDemoBootstrapped(): boolean {
  const raw = loadStringFromStorage(BOOTSTRAP_KEY);
  return raw === "1" || raw === "true";
}

export function markDemoBootstrapped(): void {
  saveStringToStorage(BOOTSTRAP_KEY, "1");
}

export function loadDemoContacts(personaId: DemoPersonaId): AgentContact[] {
  const raw = loadStringFromStorage(`${CONTACTS_PREFIX}${personaId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AgentContact[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AgentContact =>
        typeof item?.id === "string" &&
        typeof item?.did === "string" &&
        typeof item?.endpoint === "string",
    );
  } catch {
    return [];
  }
}

export function saveDemoContacts(personaId: DemoPersonaId, contacts: AgentContact[]): void {
  saveStringToStorage(`${CONTACTS_PREFIX}${personaId}`, JSON.stringify(contacts));
}

export function applyDemoPersona(personaId: DemoPersonaId): AgentContact[] {
  const persona = DEMO_PERSONAS[personaId];
  saveDemoPersona(personaId);
  saveCommsAgentConfig({ adminUrl: persona.adminUrl, adminToken: persona.adminToken });
  return loadDemoContacts(personaId);
}

export type DemoWalkthroughStep =
  | "bootstrap"
  | "send"
  | "switch-bob"
  | "respond"
  | "switch-alice"
  | "done";

export function deriveDemoWalkthroughStep(
  persona: DemoPersonaId,
  thread: readonly CommsThreadItem[],
): DemoWalkthroughStep {
  const outboundProposal = thread.some(
    (item) => item.kind === "scheduling-proposal" && item.direction === "out",
  );
  const inboundProposal = thread.some(
    (item) => item.kind === "scheduling-proposal" && item.direction === "in",
  );
  const outboundResponse = thread.some(
    (item) => item.kind === "scheduling-response" && item.direction === "out",
  );
  const inboundResponse = thread.some(
    (item) => item.kind === "scheduling-response" && item.direction === "in",
  );

  if (persona === "alice") {
    if (inboundResponse) return "done";
    if (outboundProposal) return "switch-bob";
    return "send";
  }

  if (outboundResponse) return "switch-alice";
  if (inboundProposal) return "respond";
  return "switch-alice";
}

export async function bootstrapDemoPair(): Promise<void> {
  const alice = DEMO_PERSONAS.alice;
  const bob = DEMO_PERSONAS.bob;
  const aliceClient = new CommsAgentClient(alice.adminUrl, alice.adminToken);
  const bobClient = new CommsAgentClient(bob.adminUrl, bob.adminToken);

  const aliceHealth = await waitForAgentHealth(aliceClient, alice.label);
  const bobHealth = await waitForAgentHealth(bobClient, bob.label);

  const aliceEndpoint = `${alice.adminUrl}/a2a/jsonrpc`;
  const bobEndpoint = `${bob.adminUrl}/a2a/jsonrpc`;

  const aliceConnected = aliceHealth.mlsPeers.includes(bobHealth.did);
  const bobConnected = bobHealth.mlsPeers.includes(aliceHealth.did);

  if (!aliceConnected) {
    try {
      await aliceClient.connectPeer(bobEndpoint, bobHealth.did);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) throw error;
    }
  }

  if (!bobConnected) {
    try {
      await bobClient.connectPeer(aliceEndpoint, aliceHealth.did);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) throw error;
    }
  }

  const bobContact: AgentContact = {
    id: "demo-contact-bob",
    did: bobHealth.did,
    name: bob.label,
    endpoint: bobEndpoint,
    connectedAt: new Date().toISOString(),
  };

  const aliceContact: AgentContact = {
    id: "demo-contact-alice",
    did: aliceHealth.did,
    name: alice.label,
    endpoint: aliceEndpoint,
    connectedAt: new Date().toISOString(),
  };

  saveDemoContacts("alice", [bobContact]);
  saveDemoContacts("bob", [aliceContact]);
  markDemoBootstrapped();
  applyDemoPersona("alice");
}

async function waitForAgentHealth(
  client: CommsAgentClient,
  label: string,
  maxMs = 60_000,
): Promise<{ ok: boolean; did: string; mlsPeers: string[] }> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < maxMs) {
    try {
      const health = await client.health();
      if (health.ok) return health;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
  throw new Error(
    `${label}'s agent is not reachable (${detail}). Leave pnpm dev:demo running in a terminal and check it for errors.`,
  );
}
