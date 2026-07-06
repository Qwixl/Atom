import type { AgentContact, CommsAgentConfig } from "../comms/types.js";

export type DemoSessionRole = "alice" | "bob";

export const DEMO_SESSION_FLAG = "atom-demo-session";
const DEMO_CONFIG_KEY = "atom-demo-session-config";
const DEMO_CONTACTS_KEY = "atom-demo-session-contacts";
const DEMO_PEER_CONFIG_KEY = "atom-demo-session-peer-config";
const DEMO_PEER_CONTACTS_KEY = "atom-demo-session-peer-contacts";
const DEMO_ROLE_KEY = "atom-demo-session-role";
const DEMO_DELIVERY_URL_KEY = "atom-demo-session-delivery-url";

export function isDemoSessionActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(DEMO_SESSION_FLAG) === "1";
}

export function markDemoSessionActive(): void {
  sessionStorage.setItem(DEMO_SESSION_FLAG, "1");
}

export function clearDemoSession(): void {
  sessionStorage.removeItem(DEMO_SESSION_FLAG);
  sessionStorage.removeItem(DEMO_CONFIG_KEY);
  sessionStorage.removeItem(DEMO_CONTACTS_KEY);
  sessionStorage.removeItem(DEMO_PEER_CONFIG_KEY);
  sessionStorage.removeItem(DEMO_PEER_CONTACTS_KEY);
  sessionStorage.removeItem(DEMO_ROLE_KEY);
  sessionStorage.removeItem(DEMO_DELIVERY_URL_KEY);
  sessionStorage.removeItem("atom-open-comms");
}

export function saveDemoSessionConfig(config: CommsAgentConfig): void {
  sessionStorage.setItem(DEMO_CONFIG_KEY, JSON.stringify(config));
}

export function loadDemoSessionConfig(): CommsAgentConfig | null {
  const raw = sessionStorage.getItem(DEMO_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CommsAgentConfig;
    if (!parsed.adminUrl?.trim()) return null;
    return {
      adminUrl: parsed.adminUrl.trim(),
      adminToken: parsed.adminToken?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function saveDemoSessionContacts(contacts: AgentContact[]): void {
  sessionStorage.setItem(DEMO_CONTACTS_KEY, JSON.stringify(contacts));
}

export function loadDemoSessionContacts(): AgentContact[] {
  const raw = sessionStorage.getItem(DEMO_CONTACTS_KEY);
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

export function saveDemoSessionPeerConfig(config: CommsAgentConfig): void {
  sessionStorage.setItem(DEMO_PEER_CONFIG_KEY, JSON.stringify(config));
}

export function loadDemoSessionPeerConfig(): CommsAgentConfig | null {
  const raw = sessionStorage.getItem(DEMO_PEER_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CommsAgentConfig;
    if (!parsed.adminUrl?.trim()) return null;
    return {
      adminUrl: parsed.adminUrl.trim(),
      adminToken: parsed.adminToken?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function saveDemoSessionPeerContacts(contacts: AgentContact[]): void {
  sessionStorage.setItem(DEMO_PEER_CONTACTS_KEY, JSON.stringify(contacts));
}

export function loadDemoSessionPeerContacts(): AgentContact[] {
  const raw = sessionStorage.getItem(DEMO_PEER_CONTACTS_KEY);
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

export function loadDemoSessionRole(): DemoSessionRole {
  const raw = sessionStorage.getItem(DEMO_ROLE_KEY);
  return raw === "bob" ? "bob" : "alice";
}

export function saveDemoSessionRole(role: DemoSessionRole): void {
  sessionStorage.setItem(DEMO_ROLE_KEY, role);
}

export function saveDemoSessionDeliveryUrl(url: string): void {
  sessionStorage.setItem(DEMO_DELIVERY_URL_KEY, url.replace(/\/$/, ""));
}

export function loadDemoSessionDeliveryUrl(): string | null {
  const raw = sessionStorage.getItem(DEMO_DELIVERY_URL_KEY);
  return raw?.trim() || null;
}
