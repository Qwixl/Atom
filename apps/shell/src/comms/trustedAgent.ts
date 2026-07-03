import type { OwnerRecord } from "@qwixl/owner-store";
import type { AgentContact } from "./types.js";

export interface TrustedAgentPayload {
  did: string;
  endpoint: string;
  name?: string;
  /** Owner-store categories this contact may receive without per-message disclosure chrome. */
  standingDisclosure?: string[];
}

export function parseTrustedAgentValue(value: unknown): TrustedAgentPayload | null {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<TrustedAgentPayload>;
  if (typeof parsed.did !== "string" || typeof parsed.endpoint !== "string") return null;
  const standingDisclosure = Array.isArray(parsed.standingDisclosure)
    ? parsed.standingDisclosure.filter((c): c is string => typeof c === "string")
    : undefined;
  return {
    did: parsed.did,
    endpoint: parsed.endpoint,
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    standingDisclosure,
  };
}

export function contactToTrustedAgentPayload(contact: AgentContact): TrustedAgentPayload {
  return {
    did: contact.did,
    endpoint: contact.endpoint,
    name: contact.name,
    standingDisclosure:
      contact.standingDisclosure && contact.standingDisclosure.length > 0
        ? [...contact.standingDisclosure]
        : undefined,
  };
}

export function findTrustedAgentRecord(
  records: readonly OwnerRecord[],
  did: string,
): OwnerRecord | undefined {
  return records.find((record) => {
    if (record.category !== "trusted-agents") return false;
    const payload = parseTrustedAgentValue(record.value);
    return payload?.did === did;
  });
}

export function mergeContactFromTrustedAgent(
  contact: AgentContact,
  records: readonly OwnerRecord[],
): AgentContact {
  const record = findTrustedAgentRecord(records, contact.did);
  if (!record) return contact;
  const payload = parseTrustedAgentValue(record.value);
  if (!payload) return contact;
  return {
    ...contact,
    standingDisclosure: payload.standingDisclosure ?? contact.standingDisclosure,
  };
}

export function trustedAgentValueString(contact: AgentContact): string {
  return JSON.stringify(contactToTrustedAgentPayload(contact));
}
