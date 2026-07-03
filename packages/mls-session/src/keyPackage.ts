import {
  defaultCapabilities,
  defaultLifetime,
  encodeMlsMessage,
  generateKeyPackage,
  type KeyPackage,
  type PrivateKeyPackage,
} from "ts-mls";
import { defaultCiphersuite } from "./ciphersuite.js";
import type { MlsWireMessage } from "./types.js";

function didCredential(did: string) {
  return { credentialType: "basic" as const, identity: new TextEncoder().encode(did) };
}

export interface GeneratedKeyPackage {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
  keyPackageWire: MlsWireMessage;
}

export async function generatePairKeyPackage(localDid: string): Promise<GeneratedKeyPackage> {
  const impl = await defaultCiphersuite();
  const kp = await generateKeyPackage(
    didCredential(localDid),
    defaultCapabilities(),
    defaultLifetime,
    [],
    impl,
  );
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
