import type { ClientState } from "ts-mls";
import { decodeMlsMessage, processPrivateMessage, emptyPskIndex } from "ts-mls";
import { decryptSenderData } from "ts-mls/privateMessage.js";
import {
  getCredentialFromLeafIndex,
  getSignaturePublicKeyFromLeafIndex,
} from "ts-mls/ratchetTree.js";
import { toLeafIndex } from "ts-mls/treemath.js";
import { assertCredentialBinding } from "@qwixl/protocol";
import { defaultCiphersuite } from "./ciphersuite.js";
import { credentialIdentityDid } from "./credential.js";
import type { MlsWireMessage } from "./types.js";

export interface DecryptedMlsApplication {
  plaintext: Uint8Array;
  /** Agent Identity from the sending member's MLS LeafNode credential. */
  senderDid: string;
}

/**
 * Decrypt an MLS private application message and recover the sender's DID from
 * authenticated sender data + the ratchet-tree credential (draft check 3).
 */
export async function decryptApplicationMessage(opts: {
  groupState: ClientState;
  wire: MlsWireMessage;
}): Promise<{ result: DecryptedMlsApplication; newState: ClientState }> {
  const impl = await defaultCiphersuite();
  const decoded = decodeMlsMessage(opts.wire, 0)?.[0];
  if (!decoded || decoded.wireformat !== "mls_private_message") {
    throw new Error("Expected MLS private message");
  }
  const pm = decoded.privateMessage;
  const state = opts.groupState;

  // Sender leaf is authenticated by MLS sender data (does not advance the
  // application ratchet — processPrivateMessage does that below).
  let senderDataSecret: Uint8Array;
  let ratchetTree = state.ratchetTree;
  if (pm.epoch < state.groupContext.epoch) {
    const receiverData = state.historicalReceiverData.get(pm.epoch);
    if (!receiverData) {
      throw new Error("Cannot process message, epoch too old");
    }
    senderDataSecret = receiverData.senderDataSecret;
    ratchetTree = receiverData.ratchetTree;
  } else {
    senderDataSecret = state.keySchedule.senderDataSecret;
  }

  const senderData = await decryptSenderData(pm, senderDataSecret, impl);
  if (!senderData) {
    throw new Error("Could not decrypt MLS sender data");
  }
  const leafIndex = toLeafIndex(senderData.leafIndex);
  const credential = getCredentialFromLeafIndex(ratchetTree, leafIndex);
  const senderDid = credentialIdentityDid(credential);
  assertCredentialBinding(
    senderDid,
    getSignaturePublicKeyFromLeafIndex(ratchetTree, leafIndex),
  );

  const processed = await processPrivateMessage(state, pm, emptyPskIndex, impl);
  if (processed.kind !== "applicationMessage") {
    throw new Error(`Unexpected MLS message kind: ${String(processed.kind)}`);
  }
  processed.consumed.forEach((bytes) => bytes.fill(0));

  return {
    result: { plaintext: processed.message, senderDid },
    newState: processed.newState,
  };
}
