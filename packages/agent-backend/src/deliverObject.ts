import { ClientFactory } from "@a2a-js/sdk/client";
import {
  encodeEncryptedObjectPayload,
  sendDataObject,
  sendMlsWire,
} from "@qwixl/a2a-transport";
import type { DataObject } from "@qwixl/protocol";
import { mlsContextId, type MlsSessionStore } from "./mlsSessions.js";

export interface DeliverObjectParams {
  mlsStore: MlsSessionStore;
  peerUrl: string;
  peerDid?: string;
  object: DataObject;
  encrypt?: boolean;
  contextId?: string;
}

export interface DeliverObjectResult {
  objectId: string;
  encrypted: boolean;
}

/** Strip A2A JSON-RPC suffix so ClientFactory resolves the agent card at the host root. */
export function normalizePeerBaseUrl(peerUrl: string): string {
  return peerUrl.replace(/\/a2a\/jsonrpc\/?$/i, "").replace(/\/$/, "");
}

/** Send a signed data object to a peer (plain or MLS-encrypted). */
export async function deliverSignedObject(params: DeliverObjectParams): Promise<DeliverObjectResult> {
  const peerUrl = normalizePeerBaseUrl(params.peerUrl);
  const factory = new ClientFactory();
  const client = await factory.createFromUrl(peerUrl);

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
      contextId: params.contextId ?? mlsContextId(peerDid),
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
