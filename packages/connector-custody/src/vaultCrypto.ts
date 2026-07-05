import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export interface EncryptedBlob {
  schemaVersion: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function deriveKey(masterKey: Uint8Array, salt: Uint8Array): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

export function encryptJson(masterKey: Uint8Array, value: unknown): EncryptedBlob {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(masterKey, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    schemaVersion: 1,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: encrypted.toString("base64url"),
  };
}

export function decryptJson<T>(masterKey: Uint8Array, blob: EncryptedBlob): T {
  if (blob.schemaVersion !== 1) {
    throw new Error("Unsupported vault blob schema");
  }
  const salt = Buffer.from(blob.salt, "base64url");
  const iv = Buffer.from(blob.iv, "base64url");
  const tag = Buffer.from(blob.tag, "base64url");
  const ciphertext = Buffer.from(blob.ciphertext, "base64url");
  const key = deriveKey(masterKey, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function generateMasterKey(): Uint8Array {
  return randomBytes(KEY_LENGTH);
}
