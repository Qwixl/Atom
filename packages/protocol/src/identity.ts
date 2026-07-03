import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { publicKeyToDid } from "./did.js";
import type { AgentKeyPair } from "./types.js";

ed.etc.sha512Sync = (...messages: Uint8Array[]) => sha512(ed.etc.concatBytes(...messages));

export async function generateAgentKeyPair(): Promise<AgentKeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    did: publicKeyToDid(publicKey),
    publicKey,
    privateKey,
  };
}

export async function signBytes(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

export async function verifyBytes(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  return ed.verifyAsync(signature, message, publicKey);
}
