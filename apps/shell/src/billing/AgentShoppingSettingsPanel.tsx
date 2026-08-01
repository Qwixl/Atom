import { useCallback, useEffect, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { SpendPolicySettingsPanel } from "./SpendPolicySettingsPanel.js";

type SuggestMute = { peerDid: string; count: number };

/**
 * BUS-ABUSE-01b — Agent Shopping is backend-authoritative (default off).
 * localStorage is only a last-known cache for flash; never the enforcement source.
 */
export function AgentShoppingSettingsPanel({
  workspaceId,
  vaultUnlocked = true,
  embedded = false,
}: {
  workspaceId: string;
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { client } = useAgentConfig(vaultUnlocked);
  const [enabled, setEnabled] = useState(false);
  const [suggestMutes, setSuggestMutes] = useState<SuggestMute[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const applySnapshot = useCallback(
    (snap: { agentShoppingEnabled: boolean; suggestMutes: SuggestMute[] }) => {
      setEnabled(snap.agentShoppingEnabled);
      setSuggestMutes(snap.suggestMutes);
      try {
        localStorage.setItem("atom-agent-shopper-enabled", String(snap.agentShoppingEnabled));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!vaultUnlocked) return;
    setBusy(true);
    setNote(null);
    try {
      const snap = await client.getBusinessShopping();
      applySnapshot(snap);
      setLoaded(true);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load shopping settings");
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, client, vaultUnlocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      const snap = await client.setBusinessShopping({ enabled: next });
      applySnapshot(snap);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not update shopping");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (peerDid: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await client.dismissSuggestMute(peerDid);
      setSuggestMutes(res.suggestMutes);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not dismiss mute suggestion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? undefined : "settings-panel"}>
      <SettingsToggle
        checked={enabled}
        disabled={busy || !vaultUnlocked || !loaded}
        label="Allow Agent Shopping"
        onChange={(next) => {
          void onToggle(next);
        }}
      />
      <p className="settings-note">
        When on, your agent may set up a confirmation of interest with a merchant within your
        limits. Payment still happens between you and the merchant (their checkout page). When off,
        the agent can only share product details for you to visit the merchant yourself. Default is
        off until you enable it here.
      </p>
      {note ? <p className="settings-note settings-error">{note}</p> : null}
      <details className="settings-note">
        <summary>Advanced — abuse kill-switch attestation</summary>
        <p>
          Only if an operator set <code>ATOM_COMMERCE_ABUSE=off</code>. Attestation unlocks unlimited
          commerce rates for this agent until restart reload clears the attestation file. Prefer
          leaving limits on.
        </p>
        <button
          type="button"
          disabled={busy || !vaultUnlocked || !loaded}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setNote(null);
              try {
                const snap = await client.setBusinessShopping({ attestAbuseKillSwitch: true });
                applySnapshot(snap);
                setNote("Abuse kill-switch attested for this agent.");
              } catch (error) {
                setNote(error instanceof Error ? error.message : "Attestation failed");
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Attest abuse kill-switch
        </button>
      </details>
      {suggestMutes.length > 0 ? (
        <div className="settings-note" role="status">
          <p>
            Suggest mute — peers that hit intent rate limits repeatedly. Mute is owner-only; this
            is a suggestion, not an automatic block.
          </p>
          <ul>
            {suggestMutes.map((m) => (
              <li key={m.peerDid}>
                <code>{m.peerDid}</code> ({m.count} declines){" "}
                <button type="button" disabled={busy} onClick={() => void dismiss(m.peerDid)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {enabled ? (
        <SpendPolicySettingsPanel
          workspaceId={workspaceId}
          vaultUnlocked={vaultUnlocked}
          embedded
        />
      ) : null}
    </div>
  );
}
