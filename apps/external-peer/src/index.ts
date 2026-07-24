/**
 * External peer entry — starts @qwixl/agent-backend as a network peer.
 * Prefer `pnpm peer:start` / `scripts/peer-start.mjs` so peer-oriented env defaults apply.
 */
import { startAgentServer } from "@qwixl/agent-backend";

startAgentServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
