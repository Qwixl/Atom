/**
 * ST-02b / D130 — GO extension stamp, A2A-Extensions header, required refusal,
 * and downgrade (header / message.extensions omission must not weaken verify).
 */

import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateAgentKeyPair, signDataObject } from "@qwixl/protocol";
import { Role, type AgentCard, type Message } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";
import {
  A2A_EXTENSIONS_HEADER,
  assertRequiredExtensionsSupported,
  ATOM_A2A_EXTENSION,
  atomMessage,
  buildAtomAgentCard,
  createA2aExtensionsObserveMiddleware,
  createAtomPeerClient,
  defaultAtomA2aExtensionUris,
  ExtensionSupportRequiredError,
  formatA2aExtensionsHeader,
  missingRequiredExtensions,
  parseA2aExtensionsHeader,
  sendMlsHandshake,
  sendMlsWire,
  textPart,
  verifyPartDataObject,
  type AtomA2aExtensionsRequest,
} from "./index.js";
import { dataObjectToPart } from "./parts.js";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE, COMMS_MESSAGE_PURPOSE } from "./constants.js";
import type { MlsWireMessage } from "@qwixl/mls-session";

describe("ST-02b GO extension boundary (D130)", () => {
  it("stamps GO URI on default atomMessage", () => {
    const msg = atomMessage({ parts: [textPart("hi")] });
    expect(msg.extensions).toEqual([ATOM_A2A_EXTENSION]);
  });

  it("does not stamp GO URI when declareDataObjectExtension is false (MLS Option A)", () => {
    const msg = atomMessage({
      parts: [textPart("mls")],
      declareDataObjectExtension: false,
    });
    expect(msg.extensions).toEqual([]);
  });

  it("sendDataObject stamps the GO URI on the outbound message", async () => {
    let captured: Message | undefined;
    const client = {
      sendMessage: vi.fn(async (req: { message: Message }) => {
        captured = req.message;
        return req.message;
      }),
    } as unknown as Client;

    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "go stamp" },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
      keyPair,
    );
    const { sendDataObject } = await import("./client.js");
    await sendDataObject(client, { object });
    expect(captured?.extensions).toContain(ATOM_A2A_EXTENSION);
  });

  it("sendMlsWire / sendMlsHandshake omit GO URI on the outbound message", async () => {
    let captured: Message | undefined;
    const client = {
      sendMessage: vi.fn(async (req: { message: Message }) => {
        captured = req.message;
        return req.message;
      }),
    } as unknown as Client;

    await sendMlsWire(client, {
      wire: new Uint8Array([1, 2, 3]) as MlsWireMessage,
      contextId: "mls:test",
    });
    expect(captured?.extensions ?? []).not.toContain(ATOM_A2A_EXTENSION);

    await sendMlsHandshake(client, {
      handshake: {
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zTest",
        welcome: "dGVzdA==",
        ratchetTree: "dGVzdA==",
      },
      contextId: "mls:test",
    });
    expect(captured?.extensions ?? []).not.toContain(ATOM_A2A_EXTENSION);
  });

  it("agent card declares GO with required: false and no params", () => {
    const card = buildAtomAgentCard({
      name: "Test",
      description: "ST-02b",
      baseUrl: "http://127.0.0.1:0",
    });
    const ext = card.capabilities?.extensions?.find((e) => e.uri === ATOM_A2A_EXTENSION);
    expect(ext).toBeDefined();
    expect(ext?.required).toBe(false);
    expect(ext?.params).toBeUndefined();
  });

  it("GO required:false does not refuse empty client declaration", () => {
    const card = buildAtomAgentCard({
      name: "Test",
      description: "ST-02b",
      baseUrl: "http://127.0.0.1:0",
    });
    expect(missingRequiredExtensions(card, [])).toEqual([]);
    assertRequiredExtensionsSupported(card, []);
  });

  it("parses and formats A2A-Extensions header", () => {
    expect(parseA2aExtensionsHeader(undefined)).toEqual([]);
    expect(parseA2aExtensionsHeader("")).toEqual([]);
    expect(parseA2aExtensionsHeader(`${ATOM_A2A_EXTENSION}, https://example.com/x`)).toEqual([
      ATOM_A2A_EXTENSION,
      "https://example.com/x",
    ]);
    expect(formatA2aExtensionsHeader(defaultAtomA2aExtensionUris())).toBe(ATOM_A2A_EXTENSION);
  });

  it("refuses when a required card extension is undeclared", () => {
    const card = {
      capabilities: {
        pushNotifications: false,
        extensions: [
          { uri: ATOM_A2A_EXTENSION, required: false },
          { uri: "https://example.com/required-ext", required: true },
        ],
      },
    } as AgentCard;
    expect(missingRequiredExtensions(card, [ATOM_A2A_EXTENSION])).toEqual([
      "https://example.com/required-ext",
    ]);
    expect(() => assertRequiredExtensionsSupported(card, [ATOM_A2A_EXTENSION])).toThrow(
      ExtensionSupportRequiredError,
    );
    assertRequiredExtensionsSupported(card, [
      ATOM_A2A_EXTENSION,
      "https://example.com/required-ext",
    ]);
  });

  it("omitting message.extensions does not weaken GO verify (media type wins)", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "downgrade ok" },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
      keyPair,
    );
    const part = dataObjectToPart(object);
    const verified = await verifyPartDataObject(part, {
      allowedPurposes: [COMMS_MESSAGE_PURPOSE],
    });
    expect(verified?.payload.text).toBe("downgrade ok");

    const msg = {
      messageId: "m1",
      role: Role.ROLE_USER,
      parts: [part],
      contextId: "",
      taskId: "",
      extensions: [] as string[],
      referenceTaskIds: [] as string[],
      metadata: undefined,
    };
    expect(msg.extensions).toEqual([]);
    const again = await verifyPartDataObject(msg.parts[0]!, {
      allowedPurposes: [COMMS_MESSAGE_PURPOSE],
    });
    expect(again?.payload.text).toBe("downgrade ok");
  });

  it("observe middleware records A2A-Extensions without refusing missing header", async () => {
    const app = express();
    app.use("/a2a/jsonrpc", createA2aExtensionsObserveMiddleware());
    app.post("/a2a/jsonrpc", (req: AtomA2aExtensionsRequest, res) => {
      res.json({ ok: true, extensions: req.atomA2aExtensions ?? null });
    });

    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;

    const bare = await fetch(`http://127.0.0.1:${port}/a2a/jsonrpc`, { method: "POST" });
    expect(bare.status).toBe(200);
    expect(await bare.json()).toEqual({ ok: true, extensions: [] });

    const withHeader = await fetch(`http://127.0.0.1:${port}/a2a/jsonrpc`, {
      method: "POST",
      headers: { [A2A_EXTENSIONS_HEADER]: ATOM_A2A_EXTENSION },
    });
    expect(await withHeader.json()).toEqual({ ok: true, extensions: [ATOM_A2A_EXTENSION] });

    const legacy = await fetch(`http://127.0.0.1:${port}/a2a/jsonrpc`, {
      method: "POST",
      headers: { "X-A2A-Extensions": ATOM_A2A_EXTENSION },
    });
    expect(await legacy.json()).toEqual({ ok: true, extensions: [ATOM_A2A_EXTENSION] });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("peer client SHOULD send A2A-Extensions listing the GO URI", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get(A2A_EXTENSIONS_HEADER) ?? "");
      return new Response(JSON.stringify({ error: "stub" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    };

    await expect(createAtomPeerClient("http://127.0.0.1:9", { fetchImpl })).rejects.toThrow();
    expect(seen.some((h) => h.includes(ATOM_A2A_EXTENSION))).toBe(true);
  });

  it("enforceRequiredExtensions refuses undeclared required card extensions", async () => {
    const { createAtomA2aExpressApp } = await import("./server.js");
    const { AtomDataObjectExecutor } = await import("./executor.js");
    const identity = await generateAgentKeyPair();
    const card = buildAtomAgentCard({
      name: "RequiredExt",
      description: "fixture",
      baseUrl: "http://127.0.0.1:0",
    });
    card.capabilities!.extensions = [
      ...(card.capabilities?.extensions ?? []),
      {
        uri: "https://example.com/required-ext",
        description: "fixture",
        required: true,
        params: undefined,
      },
    ];

    const app = createAtomA2aExpressApp({
      agentCard: card,
      executor: new AtomDataObjectExecutor({
        identity,
        allowedPurposes: [COMMS_MESSAGE_PURPOSE],
        sendReceipt: false,
        onReceive: () => {},
      }),
      requireTransportAuth: false,
      enforceRequiredExtensions: true,
    });

    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;

    const refused = await fetch(`http://127.0.0.1:${port}/a2a/jsonrpc`, {
      method: "POST",
      headers: { "content-type": "application/json", [A2A_EXTENSIONS_HEADER]: ATOM_A2A_EXTENSION },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: {} }),
    });
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error: string; missingExtensionUris: string[] };
    expect(body.error).toBe("ExtensionSupportRequiredError");
    expect(body.missingExtensionUris).toContain("https://example.com/required-ext");

    const ok = await fetch(`http://127.0.0.1:${port}/a2a/jsonrpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [A2A_EXTENSIONS_HEADER]: `${ATOM_A2A_EXTENSION}, https://example.com/required-ext`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: {} }),
    });
    // Auth/JSON-RPC may still fail the method, but required-extension gate passed (not 400 from that path).
    expect(ok.status).not.toBe(400);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
