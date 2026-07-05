import { createHash, randomUUID } from "node:crypto";

export interface DpopKeyPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export interface DpopProofInput {
  method: string;
  url: string;
  keyPair: DpopKeyPair;
  accessToken?: string;
  nonce?: string;
}

function base64Url(input: Buffer | Uint8Array | string): string {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return bytes.toString("base64url");
}

function canonicalJwkThumbprint(publicJwk: JsonWebKey): string {
  const required: Record<string, string> = {
    crv: String(publicJwk.crv),
    kty: String(publicJwk.kty),
    x: String(publicJwk.x),
    y: String(publicJwk.y),
  };
  const canonical = JSON.stringify(required);
  return createHash("sha256").update(canonical).digest("base64url");
}

export function computeJkt(publicJwk: JsonWebKey): string {
  return canonicalJwkThumbprint(publicJwk);
}

export async function generateDpopKeyPair(): Promise<DpopKeyPair> {
  const subtle = globalThis.crypto.subtle;
  const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicJwk = (await subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
  const privateJwk = (await subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  privateJwk.alg = "ES256";
  return { publicJwk, privateJwk };
}

async function importPrivateKey(privateJwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function encodeJwtPart(value: unknown): string {
  return base64Url(JSON.stringify(value));
}

export async function createDpopProof(input: DpopProofInput): Promise<string> {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: {
      crv: input.keyPair.publicJwk.crv,
      kty: input.keyPair.publicJwk.kty,
      x: input.keyPair.publicJwk.x,
      y: input.keyPair.publicJwk.y,
    },
  };
  const payload: Record<string, string | number> = {
    htm: input.method.toUpperCase(),
    htu: input.url.split("#")[0] ?? input.url,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  };
  if (input.accessToken) {
    payload.ath = createHash("sha256").update(input.accessToken).digest("base64url");
  }
  if (input.nonce) {
    payload.nonce = input.nonce;
  }
  const unsigned = `${encodeJwtPart(header)}.${encodeJwtPart(payload)}`;
  const key = await importPrivateKey(input.keyPair.privateJwk);
  const signature = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(unsigned, "utf8"),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
