import { ClientFactory } from "@a2a-js/sdk/client";

import { sendMlsHandshake } from "@qwixl/a2a-transport";

import type { MlsSessionStore } from "./mlsSessions.js";

import type { MlsPeerRecordStore } from "./mlsPeerRecords.js";

import { adminBaseFromPeerUrl, mlsContextId } from "./mlsSessions.js";

import { normalizePeerBaseUrl } from "./deliverObject.js";

import { base64ToBytes } from "@qwixl/protocol";



export async function reconnectStoredMlsPeers(opts: {

  mlsStore: MlsSessionStore;

  peerRecords: MlsPeerRecordStore;

  localDid: string;

}): Promise<{ attempted: number; connected: string[]; failed: { peerDid: string; error: string }[] }> {

  const connected: string[] = [];

  const failed: { peerDid: string; error: string }[] = [];

  const peers = opts.peerRecords.list().filter((peer) => peer.peerUrl?.trim());

  for (const peer of peers) {

    if (opts.mlsStore.hasSession(peer.peerDid)) continue;

    try {

      await connectMlsPeer({

        mlsStore: opts.mlsStore,

        peerRecords: opts.peerRecords,

        localDid: opts.localDid,

        peerDid: peer.peerDid,

        peerUrl: peer.peerUrl!,

      });

      connected.push(peer.peerDid);

    } catch (error) {

      failed.push({

        peerDid: peer.peerDid,

        error: error instanceof Error ? error.message : String(error),

      });

    }

  }

  return { attempted: peers.length, connected, failed };

}



export async function connectMlsPeer(opts: {

  mlsStore: MlsSessionStore;

  peerRecords: MlsPeerRecordStore;

  localDid: string;

  peerDid?: string;

  peerUrl?: string;

  invite?: string;

  initiatorEndpoint?: string;

}): Promise<{ connected: string }> {

  let peerUrl = opts.peerUrl?.trim() ?? "";

  let expectedDid = opts.peerDid?.trim();

  if (opts.invite?.trim()) {

    const { verifyContactInvite } = await import("@qwixl/a2a-transport");

    const invite = await verifyContactInvite(opts.invite.trim());

    peerUrl = invite.endpoint;

    expectedDid = invite.inviterDid;

  }

  if (!peerUrl) {

    throw new Error("peerUrl or invite token required");

  }

  const adminBase = adminBaseFromPeerUrl(peerUrl);

  const kpResp = await fetch(`${adminBase}/mls/key-package`);

  if (!kpResp.ok) {

    throw new Error(`Peer key package fetch failed: ${kpResp.status}`);

  }

  const kp = (await kpResp.json()) as { did?: string; wire?: string };

  if (!kp.did || !kp.wire) {

    throw new Error("Peer returned invalid key package");

  }

  if (expectedDid && kp.did !== expectedDid) {

    throw new Error(

      `Peer DID mismatch: expected ${expectedDid} but endpoint reports ${kp.did}`,

    );

  }



  if (opts.mlsStore.hasSession(kp.did)) {

    opts.peerRecords.remember(kp.did, peerUrl);

    return { connected: kp.did };

  }



  let handshake;

  try {

    handshake = await opts.mlsStore.connectAsInitiator({

      localDid: opts.localDid,

      peerDid: kp.did,

      peerKeyPackageWire: base64ToBytes(kp.wire),

      initiatorEndpoint: opts.initiatorEndpoint,

    });

  } catch (error) {

    const message = error instanceof Error ? error.message : String(error);

    if (/MLS session already exists/i.test(message)) {

      opts.peerRecords.remember(kp.did, peerUrl);

      return { connected: kp.did };

    }

    throw error;

  }



  try {

    const factory = new ClientFactory();

    const client = await factory.createFromUrl(normalizePeerBaseUrl(peerUrl));

    await sendMlsHandshake(client, {

      handshake,

      contextId: mlsContextId(kp.did),

      role: "user",

    });

  } catch (error) {

    opts.mlsStore.dropSession(kp.did);

    throw error;

  }



  opts.peerRecords.remember(kp.did, peerUrl);

  return { connected: kp.did };

}

