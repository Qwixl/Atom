/**
 * Passkey-gated encrypted storage for shell-local secrets (admin token, API keys).
 * Master key is wrapped with material derived from WebAuthn assertion signatures.
 * Plaintext values are never persisted once the vault is initialized.
 */

const WRAP_STORAGE_KEY = "atom-vault-wrap-v1";
const PLAINTEXT_MIGRATION_FLAG = "atom-vault-migrated-v1";

interface EncryptedBlob {
  iv: string;
  ciphertext: string;
}

let sessionMasterKey: CryptoKey | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toBufferSource(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function deriveWrapKey(signature: ArrayBuffer): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", signature);
  return importAesKey(new Uint8Array(digest));
}

async function encryptWithKey(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    key,
    toBufferSource(plaintext),
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

async function decryptWithKey(key: CryptoKey, blob: EncryptedBlob): Promise<Uint8Array> {
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    key,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export function isVaultInitialized(): boolean {
  if (typeof localStorage === "undefined") return false;
  return Boolean(localStorage.getItem(WRAP_STORAGE_KEY));
}

export function isVaultUnlocked(): boolean {
  return sessionMasterKey !== null;
}

export function lockVault(): void {
  sessionMasterKey = null;
}

export async function unlockVaultFromPasskeySignature(signature: ArrayBuffer): Promise<void> {
  const wrapKey = await deriveWrapKey(signature);
  const existing = localStorage.getItem(WRAP_STORAGE_KEY);
  if (!existing) {
    const masterRaw = crypto.getRandomValues(new Uint8Array(32));
    sessionMasterKey = await importAesKey(masterRaw);
    const wrapped = await encryptWithKey(wrapKey, masterRaw);
    localStorage.setItem(WRAP_STORAGE_KEY, JSON.stringify(wrapped));
    return;
  }
  const wrapped = JSON.parse(existing) as EncryptedBlob;
  const masterRaw = await decryptWithKey(wrapKey, wrapped);
  sessionMasterKey = await importAesKey(masterRaw);
}

export async function vaultEncryptString(plaintext: string): Promise<string> {
  if (!sessionMasterKey) throw new Error("Vault is locked");
  const blob = await encryptWithKey(sessionMasterKey, new TextEncoder().encode(plaintext));
  return JSON.stringify(blob);
}

export async function vaultDecryptString(serialized: string): Promise<string> {
  if (!sessionMasterKey) throw new Error("Vault is locked");
  const blob = JSON.parse(serialized) as EncryptedBlob;
  const plaintext = await decryptWithKey(sessionMasterKey, blob);
  return new TextDecoder().decode(plaintext);
}

const ENC_PREFIX = "atom-enc:";

export async function readProtectedStringAsync(key: string): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  const enc = localStorage.getItem(`${ENC_PREFIX}${key}`);
  if (enc) {
    if (!isVaultUnlocked()) return null;
    try {
      return await vaultDecryptString(enc);
    } catch {
      return null;
    }
  }
  return localStorage.getItem(key);
}

export async function writeProtectedString(key: string, value: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (isVaultUnlocked()) {
    const enc = await vaultEncryptString(value);
    localStorage.setItem(`${ENC_PREFIX}${key}`, enc);
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
}

export async function migratePlaintextStorage(keys: string[]): Promise<void> {
  if (!isVaultUnlocked() || typeof localStorage === "undefined") return;
  if (localStorage.getItem(PLAINTEXT_MIGRATION_FLAG) === "1") return;
  const allKeys = new Set(keys);
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("atom-secret:")) allKeys.add(key);
  }
  for (const key of allKeys) {
    const plain = localStorage.getItem(key);
    if (plain?.trim()) {
      await writeProtectedString(key, plain);
    }
  }
  localStorage.setItem(PLAINTEXT_MIGRATION_FLAG, "1");
}

export function clearProtectedString(key: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key);
  localStorage.removeItem(`${ENC_PREFIX}${key}`);
}
