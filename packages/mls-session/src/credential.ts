import {
  assertCredentialBinding,
  publicKeyToDid,
  type AgentKeyPair,
} from "@qwixl/protocol";
import {
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  type Credential,
  type KeyPackage,
  type PrivateKeyPackage,
} from "ts-mls";
import { defaultCiphersuite } from "./ciphersuite.js";
import type { MlsWireMessage } from "./types.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function didCredential(did: string): Credential {
  return { credentialType: "basic", identity: textEncoder.encode(did) };
}

/** Decode the UTF-8 DID from a basic MLS credential. */
export function credentialIdentityDid(credential: Credential): string {
  if (credential.credentialType !== "basic") {
    throw new Error(`unsupported MLS credential type: ${credential.credentialType}`);
  }
  return textDecoder.decode(credential.identity);
}

/**
 * Verify draft {{credential-binding}} on a KeyPackage LeafNode, and optionally
 * that the credential identity matches the expected peer DID.
 */
export function assertKeyPackageCredentialBinding(
  keyPackage: KeyPackage,
  expectedDid?: string,
): void {
  const identity = credentialIdentityDid(keyPackage.leafNode.credential);
  assertCredentialBinding(identity, keyPackage.leafNode.signaturePublicKey);
  if (expectedDid !== undefined && identity !== expectedDid) {
    throw new Error(
      `KeyPackage credential identity ${identity} does not match expected DID ${expectedDid}`,
    );
  }
}

/** Generate a KeyPackage whose LeafNode signature key is the Agent Identity key. */
export async function generateBoundKeyPackage(identity: AgentKeyPair): Promise<{
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
  keyPackageWire: MlsWireMessage;
}> {
  const derived = publicKeyToDid(identity.publicKey);
  if (derived !== identity.did) {
    throw new Error("AgentKeyPair.did does not match publicKey");
  }
  const impl = await defaultCiphersuite();
  const kp = await generateKeyPackageWithKey(
    didCredential(identity.did),
    defaultCapabilities(),
    defaultLifetime,
    [],
    { signKey: identity.privateKey, publicKey: identity.publicKey },
    impl,
  );
  assertKeyPackageCredentialBinding(kp.publicPackage, identity.did);
  return {
    publicPackage: kp.publicPackage,
    privatePackage: kp.privatePackage,
    keyPackageWire: encodeMlsMessage({
      keyPackage: kp.publicPackage,
      wireformat: "mls_key_package",
      version: "mls10",
    }),
  };
}
