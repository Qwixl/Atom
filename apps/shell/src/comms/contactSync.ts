import { CommsAgentClient } from "./client.js";
import { contactToTrustedAgentPayload } from "./trustedAgent.js";
import type { AgentContact } from "./types.js";

export async function syncContactsToAgent(
  client: CommsAgentClient,
  contacts: AgentContact[],
): Promise<void> {
  await client.syncContacts(
    contacts
      .filter((contact) => contact.did.trim() && contact.endpoint.trim())
      .map((contact) => contactToTrustedAgentPayload(contact)),
  );
}
