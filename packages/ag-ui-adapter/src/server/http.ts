import type { IncomingMessage, ServerResponse } from "node:http";
import type { RunAgentInput } from "@ag-ui/client";
import { writeAgUiSseStream, type AgUiEventSource } from "./sse.js";

export type AtomAgUiHttpHandlerOptions = {
  /** Path to accept POST requests on (default `/agent`). */
  path?: string;
  /** Allowed browser origins for CORS (shell embed). */
  allowedOrigins?: ReadonlySet<string>;
  /** Produce AG-UI events for a run. */
  run: (input: RunAgentInput) => AgUiEventSource;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveCorsOrigin(req: IncomingMessage, allowed: ReadonlySet<string>): string | null {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return null;
  return allowed.has(origin) ? origin : null;
}

/** Minimal Node HTTP handler for an Atom AG-UI brain endpoint. */
export function createAtomAgUiHttpHandler(options: AtomAgUiHttpHandlerOptions) {
  const path = options.path ?? "/agent";
  const allowedOrigins = options.allowedOrigins ?? new Set<string>();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const corsOrigin = resolveCorsOrigin(req, allowedOrigins);

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

    if (req.method !== "POST" || req.url !== path) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`POST ${path} with RunAgentInput JSON body`);
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

    await writeAgUiSseStream((chunk) => res.write(chunk), input, options.run(input));
  };
}
