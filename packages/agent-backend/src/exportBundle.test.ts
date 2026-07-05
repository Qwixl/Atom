import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportEncryptedBundle, importEncryptedBundle } from "./exportBundle.js";
import { installTestAdminToken } from "./testHelpers.js";
import { generateAgentKeyPair, bytesToBase64 } from "@qwixl/protocol";
import { atomicWriteJson } from "@qwixl/owner-store/file-persistence";
import { identityPath } from "./identity.js";

describe("exportBundle", () => {
  it("exports and imports an encrypted bundle", async () => {
    const restoreToken = installTestAdminToken();
    const prevData = process.env.ATOM_DATA_DIR;
    const dir = await mkdtemp(path.join(tmpdir(), "atom-export-"));
    process.env.ATOM_DATA_DIR = dir;
    try {
      const keyPair = await generateAgentKeyPair();
      await atomicWriteJson(identityPath(), {
        did: keyPair.did,
        publicKey: bytesToBase64(keyPair.publicKey),
        privateKey: bytesToBase64(keyPair.privateKey),
      });
      await atomicWriteJson(path.join(dir, "business-catalog.json"), {
        schemaVersion: 1,
        items: [{ catalogItemId: "x", label: "Item", amount: { currency: "EUR", amountMinor: 100 }, available: true }],
      });

      const exported = await exportEncryptedBundle("test-passphrase");
      expect(exported.ciphertext.length).toBeGreaterThan(20);

      await atomicWriteJson(identityPath(), { wiped: true });
      const restored = await importEncryptedBundle(exported.ciphertext, "test-passphrase");
      expect(restored.restoredFiles.length).toBeGreaterThan(0);
      const identity = await import("./identity.js").then((m) => m.loadOrCreateIdentity());
      expect(identity.did).toBe(keyPair.did);
    } finally {
      restoreToken();
      if (prevData === undefined) delete process.env.ATOM_DATA_DIR;
      else process.env.ATOM_DATA_DIR = prevData;
    }
  });
});
