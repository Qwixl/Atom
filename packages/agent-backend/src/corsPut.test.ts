import { describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Mirrors the CORS preflight allow-list used in server.ts.
 * Regression: chat-feed PUT from the shell must be allowed.
 */
function mountCors(app: express.Express, allowedOrigins: ReadonlySet<string>): void {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (typeof origin === "string" && allowedOrigins.has(origin)) {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
      res.status(204).end();
      return;
    }
    next();
  });
  app.put("/custody/store/chat-feed", (_req, res) => {
    res.json({ ok: true });
  });
}

describe("CORS preflight for custody PUT", () => {
  it("allows PUT from the production shell origin", async () => {
    const app = express();
    mountCors(app, new Set(["https://atom.qwixl.com"]));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/custody/store/chat-feed`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://atom.qwixl.com",
          "Access-Control-Request-Method": "PUT",
        },
      });
      expect(resp.status).toBe(204);
      expect(resp.headers.get("access-control-allow-methods")).toMatch(/PUT/);
      expect(resp.headers.get("access-control-allow-origin")).toBe("https://atom.qwixl.com");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
