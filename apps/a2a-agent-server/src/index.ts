import { startAgentServer } from "@qwixl/agent-backend";

startAgentServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
