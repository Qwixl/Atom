import { createServer, type IncomingMessage } from "node:http";
import { EventType, type RunAgentInput } from "@ag-ui/client";
import { writeAgUiSse } from "@qwixl/agent-backend";
import { scenarioEvents } from "./scenarios.js";

const PORT = Number(process.env.PORT ?? 5201);
const HOST = process.env.HOST ?? "127.0.0.1";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5200",
  "http://127.0.0.1:5200",
  "http://localhost:5203",
  "http://127.0.0.1:5203",
]);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveCorsOrigin(req: IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

createServer(async (req, res) => {
  const corsOrigin = resolveCorsOrigin(req);

  if (req.method === "OPTIONS") {
    if (!corsOrigin) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Origin not allowed");
      return;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/agent") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("POST /agent with RunAgentInput JSON body");
    return;
  }

  if (!corsOrigin) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Origin not allowed");
    return;
  }

  let input: RunAgentInput;
  try {
    input = JSON.parse(await readBody(req)) as RunAgentInput;
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid JSON");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": corsOrigin,
    Vary: "Origin",
  });

  await writeAgUiSse((chunk) => res.write(chunk), input, { scenario: scenarioEvents });
}).listen(PORT, HOST, () => {
  console.log(`Atom AG-UI reference server http://${HOST}:${PORT}/agent`);
  console.log(`  LLM mode when LLM_API_KEY or OPENAI_API_KEY is set; otherwise scripted scenarios.`);
});
