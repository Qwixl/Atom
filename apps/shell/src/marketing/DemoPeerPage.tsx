import { useCallback, useEffect, useState } from "react";
import { ATOM_BROWSER_MODE } from "../hostConfig.js";
import { loadBrowserAgentConfig } from "../browserAgentConfig.js";
import {
  checkAgentHealth,
  connectDemoPeerSession,
  demoPeerAdminUrl,
  fetchDemoPeerDid,
} from "./demoPeerConnect.js";
import { defaultCommsAgentUrl, loadCommsAgentConfig } from "../comms/storage.js";
import { SHOW_DEV_WORKFLOWS } from "../hostConfig.js";
import "../marketing/marketing.css";

type ServiceStatus = "checking" | "ready" | "missing";

export function DemoPeerPage({ onComplete }: { onComplete?: () => void }) {
  const browserConfig = loadBrowserAgentConfig();
  const browserMode = ATOM_BROWSER_MODE && Boolean(browserConfig?.adminToken);

  const [personalUrl, setPersonalUrl] = useState(
    browserConfig?.adminUrl ?? loadCommsAgentConfig().adminUrl ?? defaultCommsAgentUrl(),
  );
  const [personalToken, setPersonalToken] = useState(browserConfig?.adminToken ?? "");
  const [personalStatus, setPersonalStatus] = useState<ServiceStatus>("checking");
  const [peerStatus, setPeerStatus] = useState<ServiceStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const url = personalUrl.trim();
    const token = personalToken.trim();
    if (url && token) {
      const ok = await checkAgentHealth(url, token);
      setPersonalStatus(ok ? "ready" : "missing");
    } else {
      setPersonalStatus("missing");
    }
    try {
      await fetchDemoPeerDid(demoPeerAdminUrl());
      setPeerStatus("ready");
    } catch {
      setPeerStatus("missing");
    }
  }, [personalUrl, personalToken]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => clearInterval(timer);
  }, [poll]);

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      await connectDemoPeerSession({
        personalAdminUrl: personalUrl,
        personalToken,
      });
      if (onComplete) onComplete();
      else window.location.href = "/app/?demo=session";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = personalStatus === "ready" && peerStatus === "ready";

  return (
    <div className="atom-marketing">
      <header className="atom-marketing-nav">
        <a className="atom-marketing-brand" href="/">
          <span className="atom-marketing-brand-mark">A</span>
          Atom
        </a>
        <a className="atom-btn atom-btn-ghost" href="/">
          Back to site
        </a>
      </header>
      <main className="atom-marketing-main">
        <div className="atom-demo-page">
          <p className="atom-marketing-eyebrow">No account required</p>
          <h1>Connecting demo…</h1>
          <ul className="atom-demo-status-list">
            <li>
              <span className={`atom-status-dot atom-status-dot--${personalStatus === "ready" ? "active" : "pending"}`} />
              Your agent: {personalStatus === "ready" ? "Ready" : "Starting…"}
            </li>
            <li>
              <span className={`atom-status-dot atom-status-dot--${peerStatus === "ready" ? "active" : "pending"}`} />
              Demo peer: {peerStatus === "ready" ? "Ready" : "Unavailable"}
            </li>
          </ul>
          {browserMode ? null : SHOW_DEV_WORKFLOWS ? (
            <>
              <label className="atom-field">
                <span className="atom-field-label">Agent URL</span>
                <input value={personalUrl} onChange={(e) => setPersonalUrl(e.target.value)} />
              </label>
              <label className="atom-field">
                <span className="atom-field-label">Token</span>
                <input type="password" value={personalToken} onChange={(e) => setPersonalToken(e.target.value)} />
              </label>
            </>
          ) : null}
          {error ? <p className="atom-note atom-note-error">{error}</p> : null}
          <div className="auth-actions">
            <button type="button" className="atom-btn atom-btn-primary" disabled={busy || !ready} onClick={() => void startDemo()}>
              {busy ? "Connecting…" : "Start demo"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
