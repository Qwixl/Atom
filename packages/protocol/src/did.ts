import { base58 } from "@scure/base";

const ED25519_CODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/** did:key v0 — Ed25519 public key only (D022). */
export function publicKeyToDid(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const prefixed = new Uint8Array(ED25519_CODEC_PREFIX.length + publicKey.length);
  prefixed.set(ED25519_CODEC_PREFIX);
  prefixed.set(publicKey, ED25519_CODEC_PREFIX.length);
  return `did:key:z${base58.encode(prefixed)}`;
}

export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith("did:key:")) {
    throw new Error(`Unsupported DID method (v1 supports did:key only): ${did}`);
  }
  const multibase = did.slice("did:key:".length);
  const encoded = multibase.startsWith("z") ? multibase.slice(1) : multibase;
  const decoded = base58.decode(encoded);
  if (
    decoded.length !== 34 ||
    decoded[0] !== ED25519_CODEC_PREFIX[0] ||
    decoded[1] !== ED25519_CODEC_PREFIX[1]
  ) {
    throw new Error("did:key does not contain an Ed25519 public key");
  }
  return decoded.slice(2);
}

export function isDidKey(did: string): boolean {
  try {
    didToPublicKey(did);
    return true;
  } catch {
    return false;
  }
}
