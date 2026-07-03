import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  generateAgentKeyPair,
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
} from "@qwixl/protocol";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  decodeEncryptedObjectPayload,
  encodeEncryptedObjectPayload,
  sendMlsHandshake,
  sendMlsWire,
} from "./index.js";
import { createAtomA2aExpressApp } from "./server-entry.js";
import {
  MlsPairSession,
  bytesToBase64,
  base64ToBytes,
  deserializeRatchetTree,
  serializeRatchetTree,
  generatePairKeyPackage,
} from "@qwixl/mls-session";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE } from "./constants.js";

describe("MLS over A2A", () => {
  it("handshakes and delivers encrypted data objects", async () => {
    const aliceIdentity = await generateAgentKeyPair();
    const bobIdentity = await generateAgentKeyPair();
    const received: string[] = [];

    let aliceSession: MlsPairSession | undefined;
    let bobSession: MlsPairSession | undefined;
    let bobPending = await generatePairKeyPackage(bobIdentity.did);

    const bobExecutor = new AtomDataObjectExecutor({
      identity: bobIdentity as AgentKeyPair,
      allowedPurposes: [COMMS_MESSAGE_PURPOSE, "comms:receipt"],
      sendReceipt: false,
      onReceive: () => {},
      onMlsHandshake: async (event) => {
        bobSession = await MlsPairSession.joinFromWelcome({
          localDid: bobIdentity.did,
          welcomeWire: base64ToBytes(event.handshake.welcome),
          ratchetTree: deserializeRatchetTree(event.handshake.ratchetTree),
          publicPackage: bobPending.publicPackage,
          privatePackage: bobPending.privatePackage,
        });
        bobSession.peerDid = event.handshake.initiatorDid;
      },
      onMlsWire: async (event) => {
        if (!bobSession) throw new Error("missing bob session");
        const plain = await bobSession.decrypt(event.wire);
        const object = decodeEncryptedObjectPayload(plain);
        const verified = await verifyDataObject(object, {
          allowedPurposes: [COMMS_MESSAGE_PURPOSE],
        });
        received.push(String(verified.payload.text));
      },
    });

    const bobCard = buildAtomAgentCard({
      name: "Bob",
      description: "MLS test",
      baseUrl: "http://127.0.0.1:0",
    });

    const bobApp = createAtomA2aExpressApp({
      agentCard: bobCard,
      executor: bobExecutor,
    });

    const bobServer: Server = await new Promise((resolve) => {
      const s = createServer(bobApp);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    const bobAddr = bobServer.address() as AddressInfo;
    const bobBase = `http://127.0.0.1:${bobAddr.port}`;
    bobCard.url = `${bobBase}/a2a/jsonrpc`;
    bobCard.additionalInterfaces = [{ url: bobCard.url, transport: "JSONRPC" }];

    const { session: initiator } = await MlsPairSession.createInitiator(aliceIdentity.did);
    const welcomeWire = await initiator.addPeerFromKeyPackage({
      peerDid: bobIdentity.did,
      keyPackageWire: bobPending.keyPackageWire,
    });
    aliceSession = initiator;

    const factory = new ClientFactory();
    const client = await factory.createFromUrl(bobBase);
    await sendMlsHandshake(client, {
      handshake: {
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: aliceIdentity.did,
        welcome: bytesToBase64(welcomeWire),
        ratchetTree: serializeRatchetTree(initiator.ratchetTree()),
      },
      contextId: `mls:${aliceIdentity.did}`,
    });

    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "mls encrypted hello" },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
      aliceIdentity as AgentKeyPair,
    );
    const wire = await aliceSession!.encrypt(encodeEncryptedObjectPayload(object));
    await sendMlsWire(client, {
      wire,
      contextId: `mls:${aliceIdentity.did}`,
    });

    expect(received).toEqual(["mls encrypted hello"]);

    await new Promise<void>((resolve, reject) => {
      bobServer.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
