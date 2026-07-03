import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateAgentKeyPair, type AgentKeyPair, bytesToBase64, base64ToBytes } from "@qwixl/protocol";

interface StoredIdentity {
  did: string;
  publicKey: string;
  privateKey: string;
}

function defaultDataDir(): string {
  if (process.env.ATOM_DATA_DIR?.trim()) return process.env.ATOM_DATA_DIR.trim();
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".atom");
}

const IDENTITY_PATH =
  process.env.ATOM_AGENT_IDENTITY_PATH?.trim() ??
  path.join(defaultDataDir(), "agent-identity.json");

export async function loadOrCreateIdentity(): Promise<AgentKeyPair> {
  try {
    const raw = await readFile(IDENTITY_PATH, "utf8");
    const stored = JSON.parse(raw) as StoredIdentity;
    return {
      did: stored.did,
      publicKey: base64ToBytes(stored.publicKey),
      privateKey: base64ToBytes(stored.privateKey),
    };
  } catch {
    const keyPair = await generateAgentKeyPair();
    await mkdir(path.dirname(IDENTITY_PATH), { recursive: true });
    const stored: StoredIdentity = {
      did: keyPair.did,
      publicKey: bytesToBase64(keyPair.publicKey),
      privateKey: bytesToBase64(keyPair.privateKey),
    };
    await writeFile(IDENTITY_PATH, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    return keyPair;
  }
}

export function identityPath(): string {
  return IDENTITY_PATH;
}
