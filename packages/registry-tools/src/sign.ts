import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatIntegrity,
  validateModuleManifest,
  type RegistryIndex,
  type RegistryModuleEntry,
} from "@qwixl/shell-core";

/** Local curated-store signing note (demo — Fulcio OIDC is the production path). */
const CURATED_SIGNING_NOTE =
  "atom-registry digest-anchored Sigstore DSSE (M-TS-03 curated store; Fulcio optional via --fulcio)";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toBase64Url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildInTotoStatement(manifestDigest: string, manifestName: string): Record<string, unknown> {
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      {
        name: manifestName,
        digest: { sha256: manifestDigest },
      },
    ],
    predicateType: "https://atom.qwixl.dev/attestation/module-manifest/v1",
    predicate: {
      builder: { id: "atom-registry-sign" },
      note: CURATED_SIGNING_NOTE,
    },
  };
}

/**
 * Build a Sigstore-shaped DSSE bundle whose in-toto subject is the manifest digest.
 * Satisfies Atom's runtime digest check + shape gate. Full Fulcio/Rekor is separate (`--fulcio`).
 */
export function buildDigestAnchoredSigstoreBundle(
  manifestBytes: Buffer,
  manifestName = "manifest.json",
): Record<string, unknown> {
  const digest = sha256Hex(manifestBytes);
  const statement = buildInTotoStatement(digest, manifestName);
  const payload = Buffer.from(JSON.stringify(statement), "utf8");
  const payloadB64 = toBase64Url(payload);

  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const signer = createSign("SHA256");
  const payloadType = "application/vnd.in-toto+json";
  const pae = Buffer.concat([
    Buffer.from(`DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} `, "utf8"),
    payload,
  ]);
  signer.update(pae);
  const signature = signer.sign(privateKey);

  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    dsseEnvelope: {
      payload: payloadB64,
      payloadType,
      signatures: [
        {
          sig: toBase64Url(signature),
          keyid: "",
          publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
        },
      ],
    },
  };
}

export interface SignModuleOptions {
  registryDir: string;
  moduleDir: string;
  signatureFileName?: string;
}

export interface SignModuleResult {
  moduleId: string;
  version: string;
  signaturePath: string;
  signatureUrl: string;
  manifestIntegrity: string;
}

/** Sign one module manifest and mirror signatureUrl onto the registry index entry. */
export async function signModule(options: SignModuleOptions): Promise<SignModuleResult> {
  const signatureFileName = options.signatureFileName ?? "signature.sigstore.json";
  const manifestPath = path.join(options.moduleDir, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = validateModuleManifest(JSON.parse(manifestBytes.toString("utf8")));
  const signaturePath = path.join(options.moduleDir, signatureFileName);
  const bundle = buildDigestAnchoredSigstoreBundle(manifestBytes, "manifest.json");
  await writeFile(signaturePath, `${JSON.stringify(bundle, null, 2)}\n`);

  const signatureUrl = signatureFileName;
  const indexPath = path.join(options.registryDir, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as RegistryIndex;
  const integrity = formatIntegrity(sha256Hex(manifestBytes));

  let updated = false;
  index.modules = index.modules.map((entry: RegistryModuleEntry) => {
    if (entry.id !== manifest.id || entry.version !== manifest.version) return entry;
    updated = true;
    return {
      ...entry,
      signatureUrl,
      integrity: entry.integrity ?? integrity,
    };
  });
  if (!updated) {
    throw new Error(
      `Index has no entry for ${manifest.id}@${manifest.version}; run publish before sign`,
    );
  }
  index.updatedAt = new Date().toISOString();
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  return {
    moduleId: manifest.id,
    version: manifest.version,
    signaturePath,
    signatureUrl,
    manifestIntegrity: integrity,
  };
}
