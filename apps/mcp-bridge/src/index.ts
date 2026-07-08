import { createServer } from "node:http";
import { createAtomAgUiHttpHandler } from "@qwixl/ag-ui-adapter/server";
import { runBridgeTurn } from "./runTurn.js";

const PORT = Number(process.env.PORT ?? 5211);
const HOST = process.env.HOST ?? "127.0.0.1";

const ALLOWED_ORIGINS = new Set(
  (process.env.ATOM_SHELL_ORIGINS ??
    "http://localhost:5200,http://127.0.0.1:5200,http://localhost:5203,http://127.0.0.1:5203")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const handler = createAtomAgUiHttpHandler({
  allowedOrigins: ALLOWED_ORIGINS,
  run: (input) => runBridgeTurn(input),
});

createServer((req, res) => {
  void handler(req, res);
}).listen(PORT, HOST, () => {
  console.log(`Atom MCP→AG-UI bridge http://${HOST}:${PORT}/agent`);
  console.log("  Shell Chat → this URL; pair with atom-agent body for A2A/connectors.");
  console.log(`  Brain MCP tool: ${process.env.MCP_BRAIN_TOOL ?? "chat"}`);
});
