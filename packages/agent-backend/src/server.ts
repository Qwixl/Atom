import { createServer, type Server } from "node:http";
import express from "express";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  COMMS_RECEIPT_PURPOSE,
  COORDINATION_PURPOSES,
  createContactInvite,
  decodeEncryptedObjectPayload,
  encodeEncryptedObjectPayload,
  sendMlsHandshake,
  verifyContactInvite,
} from "@qwixl/a2a-transport";
import { createAtomA2aExpressApp } from "@qwixl/a2a-transport/server";
import { base64ToBytes, signDataObject, verifyDataObject, type UnsignedDataObject } from "@qwixl/protocol";
import { loadAgentBackendConfig, type AgentBackendConfig } from "./config.js";
import { registerCoordinationAdminRoutes } from "./coordinationAdmin.js";
import { deliverSignedObject } from "./deliverObject.js";
import { DataObjectInbox } from "./inbox.js";
import { identityPath, loadOrCreateIdentity } from "./identity.js";
import {
  adminBaseFromPeerUrl,
  mlsContextId,
  MlsSessionStore,
  peerDidFromContext,
} from "./mlsSessions.js";

export interface StartAgentServerOptions {
  config?: AgentBackendConfig;
}

export async function startAgentServer(options: StartAgentServerOptions = {}): Promise<Server> {
  const config = options.config ?? loadAgentBackendConfig();
  const identity = await loadOrCreateIdentity();
  const inbox = new DataObjectInbox();
  const mlsStore = new MlsSessionStore();

  const agentCard = buildAtomAgentCard({
    name: config.agentName,
    description: "Atom agent — signed data objects and MLS E2E over A2A.",
    baseUrl: config.publicBaseUrl,
    publisherDid: identity.did,
  });

  const inboxPurposes = [COMMS_MESSAGE_PURPOSE, COMMS_RECEIPT_PURPOSE, ...COORDINATION_PURPOSES];
  const mlsPurposes = [COMMS_MESSAGE_PURPOSE, ...COORDINATION_PURPOSES];

  const executor = new AtomDataObjectExecutor({
    identity,
    allowedPurposes: inboxPurposes,
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
        allowedPurposes: mlsPurposes,
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
    if (typeof origin === "string" && config.allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (typeof origin === "string" && config.allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      }
      res.status(204).end();
      return;
    }
    next();
  });

  adminApp.use(express.json({ limit: "512kb" }));

  registerCoordinationAdminRoutes(adminApp, { identity, mlsStore });

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
        endpoint: `${config.publicBaseUrl}/a2a/jsonrpc`,
        name: config.agentName,
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

      const result = await deliverSignedObject({
        mlsStore,
        peerUrl: body.peerUrl,
        peerDid: body.peerDid,
        object,
        encrypt: body.encrypt,
        contextId: body.contextId,
      });
      res.json({ sent: { objectId: result.objectId, encrypted: result.encrypted }, object });
    } catch (error) {
      res.status(
        error instanceof Error && error.message.includes("MLS session") ? 409 : 502,
      ).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  adminApp.post("/agent", async (req, res) => {
    const { writeAgUiSse } = await import("./agUi/handler.js");
    const input = req.body as import("@ag-ui/client").RunAgentInput;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    await writeAgUiSse((chunk) => res.write(chunk), input);
    res.end();
  });

  const app = express();
  app.use(adminApp);
  app.use(a2aApp);

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.on("error", reject);
    server.listen(config.port, config.host, () => {
      console.log(`Atom agent ${identity.did}`);
      console.log(`  identity file: ${identityPath()}`);
      console.log(`  agent card:    ${config.publicBaseUrl}/.well-known/agent-card.json`);
      console.log(`  A2A JSON-RPC:  ${config.publicBaseUrl}/a2a/jsonrpc`);
      console.log(`  AG-UI:         POST ${config.publicBaseUrl}/agent (SSE; set LLM_API_KEY)`);
      console.log(`  admin inbox:   ${config.publicBaseUrl}/inbox`);
      console.log(`  invite:        POST ${config.publicBaseUrl}/invite { ttlSeconds? }`);
      console.log(`  MLS connect:   POST ${config.publicBaseUrl}/mls/connect { peerUrl | invite }`);
      console.log(`  admin send:    POST ${config.publicBaseUrl}/send { peerUrl, message, encrypt?, peerDid? }`);
      console.log(`  coordination:  POST ${config.publicBaseUrl}/coordination/* (scheduling, rsvp)`);
      resolve(server);
    });
  });
}
