import {
  createAtomPeerClient,
  encodeEncryptedObjectPayload,
  normalizePeerBaseUrl as normalizeTransportPeerBaseUrl,
  sendDataObject,
  sendMlsWire,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { mlsContextId, type MlsSessionStore } from "./mlsSessions.js";

export interface DeliverObjectParams {
  mlsStore: MlsSessionStore;
  peerUrl: string;
  peerDid?: string;
  object: DataObject;
  encrypt?: boolean;
  contextId?: string;
  /** Local identity for Atom DID Bearer transport auth; defaults to mlsStore. */
  identity?: AgentKeyPair;
}

export interface DeliverObjectResult {
  objectId: string;
  encrypted: boolean;
}

/** Strip A2A JSON-RPC suffix so the agent card resolves at the host root. */
export const normalizePeerBaseUrl = normalizeTransportPeerBaseUrl;

/** Send a signed data object to a peer (plain or MLS-encrypted). */
export async function deliverSignedObject(params: DeliverObjectParams): Promise<DeliverObjectResult> {
  const client = await createAtomPeerClient(params.peerUrl, {
    identity: params.identity ?? params.mlsStore.localIdentity,
  });

  if (params.encrypt) {
    const peerDid = params.peerDid?.trim();
    if (!peerDid) {
      throw new Error("peerDid required when encrypt=true");
    }
    if (!params.mlsStore.hasSession(peerDid)) {
      throw new Error(`No MLS session for ${peerDid} — POST /mls/connect first`);
    }
    const wire = await params.mlsStore.encryptFor(
      peerDid,
      encodeEncryptedObjectPayload(params.object),
    );
    await sendMlsWire(client, {
      wire,
      // Receiver looks up its MLS session by sender DID (see mls.integration.test.ts).
      contextId: params.contextId ?? mlsContextId(params.object.issuerDid),
      role: "user",
    });
    return { objectId: params.object.id, encrypted: true };
  }

  await sendDataObject(client, {
    object: params.object,
    contextId: params.contextId,
    role: "user",
  });
  return { objectId: params.object.id, encrypted: false };
}
