import {
  decodeRatchetTree,
  encodeRatchetTree,
  stripBlankNodes,
  type RatchetTree,
} from "ts-mls/ratchetTree.js";

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/** TLS-protected binary transport for MLS ratchet trees (pair handshake). */
export function serializeRatchetTree(tree: RatchetTree): string {
  return bytesToBase64(encodeRatchetTree(stripBlankNodes(tree)));
}

export function deserializeRatchetTree(encoded: string): RatchetTree {
  const bytes = base64ToBytes(encoded);
  const decoded = decodeRatchetTree(bytes, 0);
  if (!decoded) {
    throw new Error("Invalid ratchet tree encoding");
  }
  return decoded[0];
}
