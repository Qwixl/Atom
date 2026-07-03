import { createServer } from "node:http";
import express from "express";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  COMMS_RECEIPT_PURPOSE,
  sendDataObject,
} from "@qwixl/a2a-transport";
import { createAtomA2aExpressApp } from "@qwixl/a2a-transport/server";
import { signDataObject, type UnsignedDataObject } from "@qwixl/protocol";
import { DataObjectInbox } from "./inbox.js";
import { identityPath, loadOrCreateIdentity } from "./identity.js";

const PORT = Number(process.env.PORT ?? 5204);
const HOST = process.env.HOST ?? "127.0.0.1";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://${HOST}:${PORT}`;
const AGENT_NAME = process.env.AGENT_NAME ?? "Atom reference agent";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5200",
  "http://127.0.0.1:5200",
  "http://localhost:5203",
  "http://127.0.0.1:5203",
]);

async function main(): Promise<void> {
  const identity = await loadOrCreateIdentity();
  const inbox = new DataObjectInbox();

  const agentCard = buildAtomAgentCard({
    name: AGENT_NAME,
    description: "Reference Atom agent — receives and sends signed data objects over A2A.",
    baseUrl: PUBLIC_BASE_URL,
    publisherDid: identity.did,
  });

  const executor = new AtomDataObjectExecutor({
    identity,
    allowedPurposes: [COMMS_MESSAGE_PURPOSE, COMMS_RECEIPT_PURPOSE],
    onReceive: (event) => {
      inbox.push(event);
      console.log(
        `[inbox] ${event.object.governance.purpose} from ${event.object.issuerDid} id=${event.object.id}`,
      );
    },
  });

  const a2aApp = createAtomA2aExpressApp({ agentCard, executor });
  const adminApp = express();
  adminApp.use(express.json({ limit: "256kb" }));

  adminApp.get("/health", (_req, res) => {
    res.json({ ok: true, did: identity.did, inbox: inbox.count() });
  });

  adminApp.get("/inbox", (_req, res) => {
    res.json({ entries: inbox.list() });
  });

  adminApp.post("/send", async (req, res) => {
    try {
      const body = req.body as {
        peerUrl?: string;
        message?: UnsignedDataObject;
        contextId?: string;
      };
      if (!body.peerUrl?.trim()) {
        res.status(400).json({ error: "peerUrl required" });
        return;
      }
      if (!body.message?.governance?.purpose || !body.message.semantic?.schema) {
        res.status(400).json({ error: "message (unsigned data object body) required" });
        return;
      }

      const object = await signDataObject(body.message, identity);
      const factory = new ClientFactory();
      const client = await factory.createFromUrl(body.peerUrl.replace(/\/$/, ""));
      const response = await sendDataObject(client, {
        object,
        contextId: body.contextId,
        role: "user",
      });

      res.json({ sent: object, response });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  adminApp.use((req, res, next) => {
    const origin = req.headers.origin;
    if (req.method === "OPTIONS") {
      if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Vary", "Origin");
      }
      res.status(204).end();
      return;
    }
    if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    next();
  });

  const app = express();
  app.use(adminApp);
  app.use(a2aApp);

  createServer(app).listen(PORT, HOST, () => {
    console.log(`Atom A2A agent ${identity.did}`);
    console.log(`  identity file: ${identityPath()}`);
    console.log(`  agent card:    ${PUBLIC_BASE_URL}/.well-known/agent-card.json`);
    console.log(`  A2A JSON-RPC:  ${PUBLIC_BASE_URL}/a2a/jsonrpc`);
    console.log(`  admin inbox:   ${PUBLIC_BASE_URL}/inbox`);
    console.log(`  admin send:    POST ${PUBLIC_BASE_URL}/send { peerUrl, message }`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
