import { base64ToBytes, bytesToBase64, signingPayload } from "./canonical.js";
import { didToPublicKey } from "./did.js";
import { signBytes, verifyBytes } from "./identity.js";
import { assertUsableObject } from "./governance.js";
import { validateDataObject } from "./validate.js";
import type {
  AgentKeyPair,
  DataObject,
  UnsignedDataObject,
  VerifyDataObjectOptions,
} from "./types.js";

const textEncoder = new TextEncoder();

export async function signDataObject(
  body: UnsignedDataObject,
  keyPair: AgentKeyPair,
  options: { id?: string; issuedAt?: string } = {},
): Promise<DataObject> {
  const id = options.id ?? crypto.randomUUID();
  const issuedAt = options.issuedAt ?? new Date().toISOString();

  const unsigned: Omit<DataObject, "signature" | "signatureAlgorithm"> = {
    version: 1,
    id,
    issuerDid: keyPair.did,
    issuedAt,
    semantic: body.semantic,
    payload: body.payload,
    governance: body.governance,
  };

  const message = textEncoder.encode(signingPayload({ ...unsigned, version: 1 }));
  const signatureBytes = await signBytes(keyPair.privateKey, message);

  return {
    ...unsigned,
    signatureAlgorithm: "ed25519",
    signature: bytesToBase64(signatureBytes),
  };
}

export async function verifyDataObjectSignature(object: DataObject): Promise<boolean> {
  const publicKey = didToPublicKey(object.issuerDid);
  const message = textEncoder.encode(
    signingPayload({
      version: object.version,
      id: object.id,
      issuerDid: object.issuerDid,
      issuedAt: object.issuedAt,
      semantic: object.semantic,
      payload: object.payload,
      governance: object.governance,
    }),
  );
  const signature = base64ToBytes(object.signature);
  return verifyBytes(publicKey, message, signature);
}

/** Validate shape, Ed25519 signature, expiry, and purpose policy (D024). */
export async function verifyDataObject(
  input: unknown,
  options: VerifyDataObjectOptions = {},
): Promise<DataObject> {
  const parsed = validateDataObject(input);
  if (!parsed.ok) {
    throw new Error(parsed.errors.join("; "));
  }
  const object = parsed.value;
  const validSig = await verifyDataObjectSignature(object);
  if (!validSig) {
    throw new Error(`Data object ${object.id} signature verification failed`);
  }
  assertUsableObject(object, options);
  return object;
}
