import { promises as dns } from "node:dns";
import { ATOM_BUSINESS_EXTENSION } from "@qwixl/a2a-transport";

export type DomainVerificationMethod = "dns" | "well-known";

export interface DomainVerificationResult {
  verified: boolean;
  method?: DomainVerificationMethod;
  error?: string;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

export async function verifyDnsDomainControl(
  domain: string,
  agentDid: string,
): Promise<DomainVerificationResult> {
  const normalized = normalizeDomain(domain);
  const host = `_atom.${normalized}`;
  try {
    const records = await dns.resolveTxt(host);
    const flat = records.map((parts) => parts.join("")).join(" ");
    const token = `atom-did=${agentDid}`;
    if (flat.includes(token)) {
      return { verified: true, method: "dns" };
    }
    return { verified: false, error: `DNS TXT at ${host} missing ${token}` };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyWellKnownDomainControl(
  domain: string,
  agentDid: string,
): Promise<DomainVerificationResult> {
  const normalized = normalizeDomain(domain);
  const url = `https://${normalized}/.well-known/agent-card.json`;
  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) {
      return { verified: false, error: `Well-known fetch failed (${resp.status})` };
    }
    const card = (await resp.json()) as {
      url?: string;
      capabilities?: { extensions?: Array<{ uri?: string; params?: Record<string, unknown> }> };
    };
    const extensions = card.capabilities?.extensions ?? [];
    const businessExt = extensions.find((ext) => ext.uri === ATOM_BUSINESS_EXTENSION);
    const params = businessExt?.params;
    const cardDomain =
      typeof params?.businessDomain === "string" ? params.businessDomain.toLowerCase() : "";
    if (cardDomain !== normalized) {
      return { verified: false, error: "Agent card businessDomain mismatch" };
    }
    const cardDid = typeof params?.agentDid === "string" ? params.agentDid : "";
    if (cardDid && cardDid !== agentDid) {
      return { verified: false, error: "Agent card agentDid mismatch" };
    }
    return { verified: true, method: "well-known" };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyDomainControl(
  domain: string,
  agentDid: string,
): Promise<DomainVerificationResult> {
  const dnsResult = await verifyDnsDomainControl(domain, agentDid);
  if (dnsResult.verified) return dnsResult;
  const wellKnown = await verifyWellKnownDomainControl(domain, agentDid);
  if (wellKnown.verified) return wellKnown;
  return {
    verified: false,
    error: wellKnown.error ?? dnsResult.error ?? "Domain verification failed",
  };
}
