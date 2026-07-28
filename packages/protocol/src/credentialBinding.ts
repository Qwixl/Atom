import { didToPublicKey, isDidKey } from "./did.js";

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * Credential binding (draft {{credential-binding}}).
 *
 * The MLS LeafNode `signature_key` MUST be octet-for-octet equal to the Ed25519
 * public key encoded in the Agent Identity (`did:key`) carried as the basic
 * credential identity.
 */
export function credentialBindingHolds(
  credentialIdentity: string,
  leafSignatureKey: Uint8Array,
): boolean {
  if (!isDidKey(credentialIdentity)) return false;
  let derived: Uint8Array;
  try {
    derived = didToPublicKey(credentialIdentity);
  } catch {
    return false;
  }
  return keysEqual(derived, leafSignatureKey);
}

/** Throw when credential identity and leaf signature key are not bound. */
export function assertCredentialBinding(
  credentialIdentity: string,
  leafSignatureKey: Uint8Array,
): void {
  if (!isDidKey(credentialIdentity)) {
    throw new Error("credential identity is not a did:key");
  }
  let derived: Uint8Array;
  try {
    derived = didToPublicKey(credentialIdentity);
  } catch (error) {
    throw new Error(
      `undecodable did:key: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!keysEqual(derived, leafSignatureKey)) {
    throw new Error("credential identity key != leaf signature key");
  }
}
