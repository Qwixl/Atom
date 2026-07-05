import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";
import { identityPath } from "./identity.js";
import type { StoredMlsPeer } from "./mlsPeerRecords.js";

/**
 * M13.4 + M13.6 + M13.7 export bundle.
 * Passphrase-encrypted portable archive for self-host migration (D006).
 */
const EXPORT_MAGIC = "atom-export-v1";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH = 32;

const VAULT_MASTER_KEY_FILE = "vault-master.key";
const VAULT_BLOB_FILE = "connector-vault.enc";

export interface ExportConnectorVault {
  masterKeyBase64: string;
  vaultBlob: unknown;
}

export interface ExportBundlePayload {
  magic: typeof EXPORT_MAGIC;
  exportedAt: number;
  identity: unknown;
  businessCatalog: unknown | null;
  businessContext: unknown | null;
  businessKnowledge: unknown | null;
  mlsPeers: StoredMlsPeer[];
  mlsSessions: unknown | null;
  rooms: unknown | null;
  trustedAgents: unknown | null;
  connectorVault: ExportConnectorVault | null;
  transactionCommit: unknown | null;
  disputeChannels: unknown | null;
  qualifyHistory: unknown | null;
  inbox: unknown | null;
  commerceIntents: unknown | null;
  adminTokenPath: string;
}

export interface ExportResult {
  fileName: string;
  ciphertext: string;
}

function deriveKey(passphrase: string, salt: Uint8Array): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

async function readConnectorVaultExport(): Promise<ExportConnectorVault | null> {
  const masterPath = resolveDataPath(VAULT_MASTER_KEY_FILE);
  const vaultPath = resolveDataPath(VAULT_BLOB_FILE);
  try {
    const [masterRaw, vaultBlob] = await Promise.all([
      readFile(masterPath),
      readJsonFile(vaultPath),
    ]);
    if (!vaultBlob || masterRaw.length < 32) return null;
    return {
      masterKeyBase64: masterRaw.subarray(0, 32).toString("base64"),
      vaultBlob,
    };
  } catch {
    return null;
  }
}

export async function buildExportPayload(): Promise<ExportBundlePayload> {
  const identityRaw = await readFile(identityPath(), "utf8");
  const catalog = await readJsonFile<{ items?: unknown[] }>(resolveDataPath("business-catalog.json"));
  const context = await readJsonFile<{ records?: unknown[] }>(resolveDataPath("business-context.json"));
  const knowledge = await readJsonFile<{ documents?: unknown[] }>(resolveDataPath("business-knowledge.json"));
  const peers = await readJsonFile<{ peers?: StoredMlsPeer[] }>(resolveDataPath("mls-peers.json"));
  const mlsSessions = await readJsonFile(resolveDataPath("mls-sessions.json"));
  const rooms = await readJsonFile(resolveDataPath("rooms.json"));
  const trustedAgents = await readJsonFile(resolveDataPath("trusted-agents.json"));
  const connectorVault = await readConnectorVaultExport();
  const transactionCommit = await readJsonFile(resolveDataPath("transaction-commit.json"));
  const disputeChannels = await readJsonFile(resolveDataPath("dispute-channels.json"));
  const qualifyHistory = await readJsonFile(resolveDataPath("qualify-history.json"));
  const inbox = await readJsonFile(resolveDataPath("inbox.json"));
  const commerceIntents = await readJsonFile(resolveDataPath("commerce-intents.json"));
  return {
    magic: EXPORT_MAGIC,
    exportedAt: Date.now(),
    identity: JSON.parse(identityRaw),
    businessCatalog: catalog ?? null,
    businessContext: context ?? null,
    businessKnowledge: knowledge ?? null,
    mlsPeers: peers?.peers ?? [],
    mlsSessions: mlsSessions ?? null,
    rooms: rooms ?? null,
    trustedAgents: trustedAgents ?? null,
    connectorVault,
    transactionCommit: transactionCommit ?? null,
    disputeChannels: disputeChannels ?? null,
    qualifyHistory: qualifyHistory ?? null,
    inbox: inbox ?? null,
    commerceIntents: commerceIntents ?? null,
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

async function restoreJsonFile(fileName: string, data: unknown, restoredFiles: string[]): Promise<void> {
  if (!data || typeof data !== "object") return;
  const filePath = resolveDataPath(fileName);
  await atomicWriteJson(filePath, data);
  restoredFiles.push(filePath);
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
    await restoreJsonFile("business-catalog.json", payload.businessCatalog, restoredFiles);
  }

  if (payload.businessContext && typeof payload.businessContext === "object") {
    await restoreJsonFile("business-context.json", payload.businessContext, restoredFiles);
  }

  if (payload.businessKnowledge && typeof payload.businessKnowledge === "object") {
    await restoreJsonFile("business-knowledge.json", payload.businessKnowledge, restoredFiles);
  }

  if (payload.mlsPeers?.length) {
    const peersPath = resolveDataPath("mls-peers.json");
    await atomicWriteJson(peersPath, {
      schemaVersion: 1,
      peers: payload.mlsPeers,
    });
    restoredFiles.push(peersPath);
  }

  await restoreJsonFile("mls-sessions.json", payload.mlsSessions, restoredFiles);
  await restoreJsonFile("rooms.json", payload.rooms, restoredFiles);
  await restoreJsonFile("trusted-agents.json", payload.trustedAgents, restoredFiles);

  if (payload.connectorVault?.vaultBlob && payload.connectorVault.masterKeyBase64) {
    const masterPath = resolveDataPath(VAULT_MASTER_KEY_FILE);
    const vaultPath = resolveDataPath(VAULT_BLOB_FILE);
    await mkdir(path.dirname(masterPath), { recursive: true });
    const masterKey = Buffer.from(payload.connectorVault.masterKeyBase64, "base64");
    await writeFile(masterPath, masterKey, { mode: 0o600 });
    await atomicWriteJson(vaultPath, payload.connectorVault.vaultBlob);
    restoredFiles.push(masterPath, vaultPath);
  }

  const commerceFiles: Array<[keyof ExportBundlePayload, string]> = [
    ["transactionCommit", "transaction-commit.json"],
    ["disputeChannels", "dispute-channels.json"],
    ["qualifyHistory", "qualify-history.json"],
    ["inbox", "inbox.json"],
    ["commerceIntents", "commerce-intents.json"],
  ];
  for (const [key, fileName] of commerceFiles) {
    await restoreJsonFile(fileName, payload[key], restoredFiles);
  }

  return { restoredFiles };
}
