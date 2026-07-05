import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { loadCommsAgentConfig } from "../comms/storage.js";
import { fetchCustodyStatus } from "./client.js";
import {
  isVaultInitialized,
  isVaultUnlocked,
  migratePlaintextStorage,
  unlockVaultFromPasskeySignature,
} from "./dataVault.js";

const PROTECTED_KEYS = ["atom-comms-admin-token", "atom-secret:atom.llm.primary"];

function signatureBytes(signature: string): ArrayBuffer {
  const binary = atob(signature.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function VaultUnlockGate({
  onUnlocked,
}: {
  onUnlocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isVaultInitialized() || isVaultUnlocked()) return null;

  async function unlock(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const config = loadCommsAgentConfig();
      const status = await fetchCustodyStatus(config);
      if (!status.passkeyRegistered) {
        throw new Error("Register a passkey in Settings → Security before unlocking the vault.");
      }
      const resp = await fetch(`${config.adminUrl.replace(/\/$/, "")}/custody/unlock/options`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.adminToken?.trim()
            ? { Authorization: `Bearer ${config.adminToken.trim()}` }
            : {}),
        },
        body: "{}",
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Unlock failed (${resp.status})`);
      }
      const begin = (await resp.json()) as {
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      };
      const assertion = await startAuthentication({ optionsJSON: begin.options });
      const verifyResp = await fetch(`${config.adminUrl.replace(/\/$/, "")}/custody/unlock/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.adminToken?.trim()
            ? { Authorization: `Bearer ${config.adminToken.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          response: assertion,
          challenge: begin.options.challenge,
        }),
      });
      if (!verifyResp.ok) {
        const body = (await verifyResp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Unlock verify failed (${verifyResp.status})`);
      }
      await unlockVaultFromPasskeySignature(signatureBytes(assertion.response.signature));
      await migratePlaintextStorage(PROTECTED_KEYS);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chrome-overlay settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-dialog first-run-dialog">
        <div className="settings-dialog-header">
          <h2>Unlock Atom</h2>
        </div>
        <div className="settings-dialog-body">
          <p className="settings-note">
            Your local secrets are encrypted. Authenticate with your passkey to decrypt admin credentials
            and API keys stored on this device.
          </p>
          {error ? <p className="comms-status-error">{error}</p> : null}
          <div className="chrome-actions settings-section-actions">
            <button type="button" className="chrome-approve" disabled={busy} onClick={() => void unlock()}>
              {busy ? "Unlocking…" : "Unlock with passkey"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
