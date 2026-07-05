import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";
import { identityPath } from "./identity.js";
import type { StoredMlsPeer } from "./mlsPeerRecords.js";

/**
 * M13.4 export bundle — v1 scope (see docs/02-architecture/20-v1-production-gaps.md).
 * Includes: identity, business catalog/context/knowledge, MLS peers.
 * Not yet included: transaction commit state, dispute channels, qualify history,
 * connector vault, MLS session snapshots, inbox log.
 */
const EXPORT_MAGIC = "atom-export-v1";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH = 32;

export interface ExportBundlePayload {
  magic: typeof EXPORT_MAGIC;
  exportedAt: number;
  identity: unknown;
  businessCatalog: unknown | null;
  businessContext: unknown | null;
  businessKnowledge: unknown | null;
  mlsPeers: StoredMlsPeer[];
  adminTokenPath: string;
}

export interface ExportResult {
  fileName: string;
  ciphertext: string;
}

function deriveKey(passphrase: string, salt: Uint8Array): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

export async function buildExportPayload(): Promise<ExportBundlePayload> {
  const identityRaw = await readFile(identityPath(), "utf8");
  const catalog = await readJsonFile<{ items?: unknown[] }>(resolveDataPath("business-catalog.json"));
  const context = await readJsonFile<{ records?: unknown[] }>(resolveDataPath("business-context.json"));
  const knowledge = await readJsonFile<{ documents?: unknown[] }>(resolveDataPath("business-knowledge.json"));
  const peers = await readJsonFile<{ peers?: StoredMlsPeer[] }>(resolveDataPath("mls-peers.json"));
  return {
    magic: EXPORT_MAGIC,
    exportedAt: Date.now(),
    identity: JSON.parse(identityRaw),
    businessCatalog: catalog ?? null,
    businessContext: context ?? null,
    businessKnowledge: knowledge ?? null,
    mlsPeers: peers?.peers ?? [],
    adminTokenPath: path.basename(resolveDataPath("agent-admin-token.txt")),
  };
}

export async function exportEncryptedBundle(passphrase: string): Promise<ExportResult> {
  if (!passphrase.trim()) {
    throw new Error("Passphrase required");
  }
  const payload = await buildExportPayload();
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
  const fileName = `atom-export-${new Date().toISOString().replace(/[:.]/g, "-")}.atom`;
  return { fileName, ciphertext: packed };
}

export async function importEncryptedBundle(
  ciphertext: string,
  passphrase: string,
): Promise<{ restoredFiles: string[] }> {
  if (!passphrase.trim()) {
    throw new Error("Passphrase required");
  }
  const raw = Buffer.from(ciphertext.trim(), "base64");
  if (raw.length < SALT_BYTES + IV_BYTES + 16 + 1) {
    throw new Error("Invalid export bundle");
  }
  const salt = raw.subarray(0, SALT_BYTES);
  const iv = raw.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = raw.subarray(SALT_BYTES + IV_BYTES, SALT_BYTES + IV_BYTES + 16);
  const encrypted = raw.subarray(SALT_BYTES + IV_BYTES + 16);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const payload = JSON.parse(plaintext.toString("utf8")) as ExportBundlePayload;
  if (payload.magic !== EXPORT_MAGIC) {
    throw new Error("Unrecognized export bundle format");
  }

  const restoredFiles: string[] = [];
  await atomicWriteJson(identityPath(), payload.identity);
  restoredFiles.push(identityPath());

  if (payload.businessCatalog && typeof payload.businessCatalog === "object") {
    const catalogPath = resolveDataPath("business-catalog.json");
    await atomicWriteJson(catalogPath, payload.businessCatalog);
    restoredFiles.push(catalogPath);
  }

  if (payload.businessContext && typeof payload.businessContext === "object") {
    const contextPath = resolveDataPath("business-context.json");
    await atomicWriteJson(contextPath, payload.businessContext);
    restoredFiles.push(contextPath);
  }

  if (payload.businessKnowledge && typeof payload.businessKnowledge === "object") {
    const knowledgePath = resolveDataPath("business-knowledge.json");
    await atomicWriteJson(knowledgePath, payload.businessKnowledge);
    restoredFiles.push(knowledgePath);
  }

  if (payload.mlsPeers?.length) {
    const peersPath = resolveDataPath("mls-peers.json");
    await atomicWriteJson(peersPath, {
      schemaVersion: 1,
      peers: payload.mlsPeers,
    });
    restoredFiles.push(peersPath);
  }

  return { restoredFiles };
}
