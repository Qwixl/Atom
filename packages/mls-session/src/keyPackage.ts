import type { AgentKeyPair } from "@qwixl/protocol";
import type { KeyPackage, PrivateKeyPackage } from "ts-mls";
import { generateBoundKeyPackage } from "./credential.js";
import type { MlsWireMessage } from "./types.js";

export interface GeneratedKeyPackage {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
  keyPackageWire: MlsWireMessage;
}

export async function generatePairKeyPackage(
  identity: AgentKeyPair,
): Promise<GeneratedKeyPackage> {
  return generateBoundKeyPackage(identity);
}
