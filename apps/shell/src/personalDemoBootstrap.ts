import { CommsAgentClient } from "./comms/client.js";
import { DEMO_PERSONAS } from "./demoPersonas.js";

export async function bootstrapPersonalDemo(): Promise<void> {
  const alice = DEMO_PERSONAS.alice;
  const client = new CommsAgentClient(alice.adminUrl, alice.adminToken);
  const health = await client.health();
  if (!health.ok) {
    throw new Error(`Personal agent not ready at ${alice.adminUrl}`);
  }
}
