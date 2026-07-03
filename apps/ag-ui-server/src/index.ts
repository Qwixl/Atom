import { createServer, type IncomingMessage } from "node:http";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { scenarioEvents } from "./scenarios.js";

const PORT = Number(process.env.PORT ?? 5201);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeSse(res: import("node:http").ServerResponse, event: BaseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/agent") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("POST /agent with RunAgentInput JSON body");
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
    "Access-Control-Allow-Origin": "*",
  });

  const { threadId, runId } = input;
  writeSse(res, { type: EventType.RUN_STARTED, threadId, runId });

  try {
    for (const event of scenarioEvents(input)) {
      writeSse(res, event);
    }
    writeSse(res, { type: EventType.RUN_FINISHED, threadId, runId });
  } catch (error) {
    writeSse(res, {
      type: EventType.RUN_ERROR,
      threadId,
      runId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  res.end();
}).listen(PORT, () => {
  console.log(`Atom AG-UI reference server http://localhost:${PORT}/agent`);
});
