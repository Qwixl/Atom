import { createServer } from "node:http";
import express from "express";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  COMMS_RECEIPT_PURPOSE,
  createContactInvite,
  decodeEncryptedObjectPayload,
  encodeEncryptedObjectPayload,
  sendDataObject,
  sendMlsHandshake,
  sendMlsWire,
  verifyContactInvite,
} from "@qwixl/a2a-transport";
import { createAtomA2aExpressApp } from "@qwixl/a2a-transport/server";
import { base64ToBytes, signDataObject, verifyDataObject, type UnsignedDataObject } from "@qwixl/protocol";
import { DataObjectInbox } from "./inbox.js";
import { identityPath, loadOrCreateIdentity } from "./identity.js";
import {
  adminBaseFromPeerUrl,
  mlsContextId,
  MlsSessionStore,
  peerDidFromContext,
} from "./mlsSessions.js";

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
  const mlsStore = new MlsSessionStore();

  const agentCard = buildAtomAgentCard({
    name: AGENT_NAME,
    description: "Reference Atom agent — signed data objects and MLS E2E over A2A.",
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
    onMlsHandshake: async (event) => {
      await mlsStore.acceptHandshake({
        localDid: identity.did,
        handshake: event.handshake,
      });
      console.log(`[mls] session established with ${event.handshake.initiatorDid}`);
    },
    onMlsWire: async (event) => {
      const peerDid =
        peerDidFromContext(event.contextId) ??
        (mlsStore.listPeers().length === 1 ? mlsStore.listPeers()[0] : undefined);
      if (!peerDid) {
        throw new Error("Cannot resolve peer DID for MLS message (set contextId to mls:<did>)");
      }
      const plaintext = await mlsStore.decryptFrom(peerDid, event.wire);
      const object = decodeEncryptedObjectPayload(plaintext);
      const verified = await verifyDataObject(object, {
        allowedPurposes: [COMMS_MESSAGE_PURPOSE],
      });
      inbox.push({
        object: verified,
        contextId: event.contextId,
        messageId: event.messageId,
      });
      console.log(
        `[inbox/mls] ${verified.governance.purpose} from ${verified.issuerDid} id=${verified.id}`,
      );
    },
  });

  const a2aApp = createAtomA2aExpressApp({ agentCard, executor });
  const adminApp = express();

  adminApp.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      }
      res.status(204).end();
      return;
    }
    next();
  });

  adminApp.use(express.json({ limit: "512kb" }));

  adminApp.get("/health", (_req, res) => {
    res.json({
      ok: true,
      did: identity.did,
      inbox: inbox.count(),
      mlsPeers: mlsStore.listPeers(),
    });
  });

  adminApp.get("/inbox", (_req, res) => {
    res.json({ entries: inbox.list() });
  });

  adminApp.get("/mls/key-package", async (_req, res) => {
    try {
      const payload = await mlsStore.keyPackageForHandshake(identity.did);
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/mls/sessions", (_req, res) => {
    res.json({ peers: mlsStore.listPeers() });
  });

  adminApp.post("/invite", async (req, res) => {
    try {
      const body = req.body as { ttlSeconds?: number };
      const { token, object } = await createContactInvite({
        identity,
        endpoint: `${PUBLIC_BASE_URL}/a2a/jsonrpc`,
        name: AGENT_NAME,
        ttlSeconds: body?.ttlSeconds,
      });
      res.json({ token, expiresBy: object.governance.ttlSeconds, issuerDid: identity.did });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/mls/connect", async (req, res) => {
    try {
      const body = req.body as { peerUrl?: string; invite?: string };
      let peerUrl = body.peerUrl?.trim();
      let expectedDid: string | undefined;
      if (body.invite?.trim()) {
        const invite = await verifyContactInvite(body.invite.trim());
        peerUrl = invite.endpoint;
        expectedDid = invite.inviterDid;
      }
      if (!peerUrl) {
        res.status(400).json({ error: "peerUrl or invite token required" });
        return;
      }
      const adminBase = adminBaseFromPeerUrl(peerUrl);
      const kpResp = await fetch(`${adminBase}/mls/key-package`);
      if (!kpResp.ok) {
        res.status(502).json({ error: `Peer key package fetch failed: ${kpResp.status}` });
        return;
      }
      const kp = (await kpResp.json()) as { did?: string; wire?: string };
      if (!kp.did || !kp.wire) {
        res.status(502).json({ error: "Peer returned invalid key package" });
        return;
      }
      if (expectedDid && kp.did !== expectedDid) {
        res.status(502).json({
          error: `Peer DID mismatch: invite was signed by ${expectedDid} but endpoint reports ${kp.did}`,
        });
        return;
      }
      const handshake = await mlsStore.connectAsInitiator({
        localDid: identity.did,
        peerDid: kp.did,
        peerKeyPackageWire: base64ToBytes(kp.wire),
      });
      const factory = new ClientFactory();
      const client = await factory.createFromUrl(peerUrl.replace(/\/$/, ""));
      await sendMlsHandshake(client, {
        handshake,
        contextId: mlsContextId(kp.did),
        role: "user",
      });
      res.json({ connected: kp.did, handshake: { initiatorDid: handshake.initiatorDid } });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/send", async (req, res) => {
    try {
      const body = req.body as {
        peerUrl?: string;
        peerDid?: string;
        message?: UnsignedDataObject;
        contextId?: string;
        encrypt?: boolean;
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

      if (body.encrypt) {
        const peerDid = body.peerDid?.trim();
        if (!peerDid) {
          res.status(400).json({ error: "peerDid required when encrypt=true" });
          return;
        }
        if (!mlsStore.hasSession(peerDid)) {
          res.status(409).json({ error: `No MLS session for ${peerDid} — POST /mls/connect first` });
          return;
        }
        const wire = await mlsStore.encryptFor(
          peerDid,
          encodeEncryptedObjectPayload(object),
        );
        const response = await sendMlsWire(client, {
          wire,
          contextId: body.contextId ?? mlsContextId(peerDid),
          role: "user",
        });
        res.json({ sent: { encrypted: true, objectId: object.id }, response });
        return;
      }

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

  const app = express();
  app.use(adminApp);
  app.use(a2aApp);

  createServer(app).listen(PORT, HOST, () => {
    console.log(`Atom A2A agent ${identity.did}`);
    console.log(`  identity file: ${identityPath()}`);
    console.log(`  agent card:    ${PUBLIC_BASE_URL}/.well-known/agent-card.json`);
    console.log(`  A2A JSON-RPC:  ${PUBLIC_BASE_URL}/a2a/jsonrpc`);
    console.log(`  admin inbox:   ${PUBLIC_BASE_URL}/inbox`);
    console.log(`  invite:        POST ${PUBLIC_BASE_URL}/invite { ttlSeconds? }`);
    console.log(`  MLS connect:   POST ${PUBLIC_BASE_URL}/mls/connect { peerUrl | invite }`);
    console.log(`  admin send:    POST ${PUBLIC_BASE_URL}/send { peerUrl, message, encrypt?, peerDid? }`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
