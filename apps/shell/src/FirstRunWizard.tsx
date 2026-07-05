import { useEffect, useState } from "react";

import { CommsAgentClient } from "./comms/client.js";

import {

  defaultCommsAgentUrl,

  loadCommsAgentConfig,

  loadContacts,

  saveCommsAgentConfig,

  saveCommsAgentConfigSecure,

  saveContacts,

  saveOwnerAgentKind,

  type OwnerAgentKind,

} from "./comms/storage.js";

import { saveValidatedAgentConnection } from "./comms/agentConnection.js";

import type { AgentContact } from "./comms/types.js";
import { IS_DEMO_MODE } from "./demoPersonas.js";



import { markFirstRunDone } from "./firstRunStorage.js";
import { CONTROL_PLANE_URL, MANAGED_HOSTING, SHOW_DEV_WORKFLOWS } from "./hostConfig.js";
import { productionFetchUrl, resolveInjectedUrl } from "./productionGuard.js";
import { probeLocalDevAgentBase } from "./devAgentProbe.js";
import {
  bareOwnerHandle,
  normalizeOwnerHandle,
  saveOwnerHandle,
  validateOwnerHandle,
} from "./ownerHandle.js";

function hostedStubAgentUrl(): string {
  return resolveInjectedUrl(import.meta.env.VITE_hostedStubAgentUrl() as string, "http://127.0.0.1:5301");
}

function hostedStubAgentToken(): string {
  return resolveInjectedUrl(import.meta.env.VITE_hostedStubAgentToken() as string, "atom-hosted-dev-token");
}

function demoPeerAdminUrl(): string {
  return resolveInjectedUrl(import.meta.env.VITE_DEMO_PEER_URL as string, "http://127.0.0.1:5205");
}

function demoPersonalAgentUrl(): string {
  return resolveInjectedUrl(import.meta.env.VITE_DEMO_PERSONAL_AGENT_URL as string, "http://127.0.0.1:5204");
}

function demoPersonalAgentToken(): string {
  return (import.meta.env.VITE_DEMO_PERSONAL_AGENT_TOKEN as string | undefined)?.trim() ?? "";
}

const SHOW_DEMO_PEER = SHOW_DEV_WORKFLOWS || (IS_DEMO_MODE && !MANAGED_HOSTING);

const SHELL_URL =
  (import.meta.env.VITE_SHELL_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

const DEMO_PEER_ADMIN_TOKEN =
  (import.meta.env.VITE_DEMO_PEER_TOKEN as string | undefined)?.trim() ?? "atom-demo-peer-token";

async function requestDemoSchedulingProposal(
  personalAdmin: string,
  personalToken: string,
): Promise<void> {
  const client = new CommsAgentClient(personalAdmin, personalToken);
  const health = await client.health();
  const resp = await fetch(`${productionFetchUrl(demoPeerAdminUrl()) ?? ""}/demo/resend-proposal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEMO_PEER_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ peerDid: health.did }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Demo proposal failed (${resp.status})`);
  }
}



function validateAdminToken(token: string): string | null {

  const trimmed = token.trim();

  if (trimmed.startsWith("did:key:")) {

    return "That looks like an ID, not a connection token.";

  }

  if (trimmed.length < 8) {

    return "Admin token looks too short.";

  }

  return null;

}



function explainConnectError(error: unknown, personalAdmin: string): string {

  const message = error instanceof Error ? error.message : String(error);

  if (/MLS session already exists/i.test(message)) {

    return "";

  }

  if (/failed to fetch|connection refused|networkerror/i.test(message)) {

    if (IS_DEMO_MODE) {

      return `Cannot reach your agent at ${personalAdmin}. Wait for the green check below, or restart with pnpm dev:demo.`;

    }

    return `Cannot reach your agent at ${personalAdmin}. Run pnpm dev:demo in the repo (one command starts everything).`;

  }

  if (/unauthorized|401/i.test(message)) {

    return `Admin token rejected. ${IS_DEMO_MODE ? "Restart with pnpm dev:demo." : "Run pnpm dev:demo instead of separate terminals."}`;

  }

  return message;

}



type SetupMode = "choose" | "hosted" | "self-host" | "demo-peer";

type ServiceStatus = "checking" | "ready" | "missing";

async function fetchDemoPeerDid(adminBase: string): Promise<string> {

  const resp = await fetch(`${adminBase}/mls/key-package`);

  if (!resp.ok) throw new Error(`Demo peer not reachable at ${adminBase} (${resp.status})`);

  const body = (await resp.json()) as { did?: string };

  if (!body.did?.trim()) throw new Error("Demo peer returned no DID");

  return body.did.trim();

}



async function checkPersonalAgent(url: string, token: string): Promise<boolean> {

  if (!url || !token) return false;

  try {

    const client = new CommsAgentClient(url, token);

    const health = await client.health();

    return health.ok === true;

  } catch {

    return false;

  }

}



async function checkControlPlane(): Promise<{ ok: boolean; fleetMode?: string }> {

  try {

    const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/health`);

    if (!resp.ok) return { ok: false };

    const body = (await resp.json()) as { fleetMode?: string };

    return { ok: true, fleetMode: body.fleetMode };

  } catch {

    return { ok: false };

  }

}



export function FirstRunWizard({

  onDone,

  onOpenComms,

}: {

  onDone: () => void;

  onOpenComms?: () => void;

}) {

  const existing = loadCommsAgentConfig();

  const [mode, setMode] = useState<SetupMode>(
    IS_DEMO_MODE ? "demo-peer" : MANAGED_HOSTING ? "hosted" : "choose",
  );

  const [email, setEmail] = useState("");

  const [ownerHandle, setOwnerHandle] = useState("");

  const [handleStatus, setHandleStatus] = useState<string | null>(null);

  const [adminUrl, setAdminUrl] = useState(existing.adminUrl || defaultCommsAgentUrl());

  const [adminToken, setAdminToken] = useState(existing.adminToken ?? "");

  const [personalUrl, setPersonalUrl] = useState(demoPersonalAgentUrl());

  const [personalToken, setPersonalToken] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [personalStatus, setPersonalStatus] = useState<ServiceStatus>("checking");

  const [peerStatus, setPeerStatus] = useState<ServiceStatus>("checking");

  const [controlPlaneStatus, setControlPlaneStatus] = useState<ServiceStatus>("checking");

  const [hostedAgentStatus, setHostedAgentStatus] = useState<ServiceStatus>("checking");

  const [controlPlaneFleetMode, setControlPlaneFleetMode] = useState<string | null>(null);

  const [localDevAgentUrl, setLocalDevAgentUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);



  useEffect(() => {

    if (!SHOW_DEMO_PEER || mode !== "demo-peer") return;



    let cancelled = false;



    async function poll() {

      const personalTokenForCheck = IS_DEMO_MODE

        ? demoPersonalAgentToken()

        : personalToken.trim();

      const personalUrlForCheck = IS_DEMO_MODE ? demoPersonalAgentUrl() : personalUrl.trim();



      if (IS_DEMO_MODE || (personalUrlForCheck && personalTokenForCheck)) {

        const personalOk = await checkPersonalAgent(personalUrlForCheck, personalTokenForCheck);

        if (!cancelled) setPersonalStatus(personalOk ? "ready" : "missing");

      } else if (!cancelled) {

        setPersonalStatus("missing");

      }



      try {

        await fetchDemoPeerDid(demoPeerAdminUrl());

        if (!cancelled) setPeerStatus("ready");

      } catch {

        if (!cancelled) setPeerStatus("missing");

      }

    }



    void poll();

    const timer = setInterval(() => void poll(), 2500);

    return () => {

      cancelled = true;

      clearInterval(timer);

    };

  }, [mode, personalUrl, personalToken]);



  useEffect(() => {
    if (MANAGED_HOSTING) return;
    void probeLocalDevAgentBase().then((url) => {
      if (url) {
        setLocalDevAgentUrl(url);
        setAdminUrl(url);
      }
    });
  }, []);

  useEffect(() => {

    if (mode !== "hosted") return;



    let cancelled = false;



    async function poll() {

      const plane = await checkControlPlane();

      if (!cancelled) {
        setControlPlaneStatus(plane.ok ? "ready" : "missing");
        setControlPlaneFleetMode(plane.fleetMode ?? null);
      }

      if (MANAGED_HOSTING) {
        if (!cancelled) setHostedAgentStatus("ready");
        return;
      }

      const agentOk = await checkPersonalAgent(hostedStubAgentUrl(), hostedStubAgentToken());

      if (!cancelled) setHostedAgentStatus(agentOk ? "ready" : "missing");

    }



    void poll();

    const timer = setInterval(() => void poll(), 2500);

    return () => {

      cancelled = true;

      clearInterval(timer);

    };

  }, [mode]);



  useEffect(() => {

    if (mode !== "hosted" && mode !== "self-host") return;

    const validationError = ownerHandle.trim() ? validateOwnerHandle(ownerHandle) : null;

    if (validationError) {

      setHandleStatus(validationError);

      return;

    }

    if (!ownerHandle.trim()) {

      setHandleStatus(null);

      return;

    }

    if (mode !== "hosted") {

      setHandleStatus(`Your handle will be ${normalizeOwnerHandle(ownerHandle)}`);

      return;

    }



    let cancelled = false;

    const timer = setTimeout(() => {

      void (async () => {

        try {

          const resp = await fetch(

            `${CONTROL_PLANE_URL.replace(/\/$/, "")}/handles/check?handle=${encodeURIComponent(normalizeOwnerHandle(ownerHandle))}`,

          );

          const data = (await resp.json()) as { available?: boolean; error?: string; handle?: string };

          if (cancelled) return;

          if (data.available) {

            setHandleStatus(`${data.handle ?? normalizeOwnerHandle(ownerHandle)} is available`);

          } else {

            setHandleStatus(data.error ?? "That handle is not available.");

          }

        } catch {

          if (!cancelled) setHandleStatus(null);

        }

      })();

    }, 400);



    return () => {

      cancelled = true;

      clearTimeout(timer);

    };

  }, [mode, ownerHandle]);



  function finish() {

    markFirstRunDone();

    onDone();

  }



  async function finishWithConfig(
    config: { adminUrl: string; adminToken?: string },
    kind?: OwnerAgentKind,
  ) {
    await saveValidatedAgentConnection({
      adminUrl: config.adminUrl,
      adminToken: config.adminToken,
    });
    await saveCommsAgentConfigSecure({
      adminUrl: config.adminUrl,
      adminToken: config.adminToken,
    });
    if (kind) saveOwnerAgentKind(kind);
    if (ownerHandle.trim()) saveOwnerHandle(ownerHandle);
    finish();
  }



  async function submitDemoPeer() {

    setBusy(true);

    setStatus(null);

    try {

      const personalAdmin = (IS_DEMO_MODE ? demoPersonalAgentUrl() : personalUrl.trim()).replace(

        /\/$/,

        "",

      );

      const token = (IS_DEMO_MODE ? demoPersonalAgentToken() : personalToken.trim()).trim();



      if (!personalAdmin || !token) {

        throw new Error("Agent URL and connection token are required.");

      }

      if (!IS_DEMO_MODE) {

        const tokenError = validateAdminToken(token);

        if (tokenError) throw new Error(tokenError);

      }

      if (personalAdmin === demoPeerAdminUrl()) {

        throw new Error("Use your personal agent URL, not the demo peer URL.");

      }



      const demoEndpoint = `${demoPeerAdminUrl()}/a2a/jsonrpc`;

      const demoDid = await fetchDemoPeerDid(demoPeerAdminUrl());



      saveCommsAgentConfig({ adminUrl: personalAdmin, adminToken: token });



      const contact: AgentContact = {

        id: crypto.randomUUID(),

        did: demoDid,

        name: "Qwixl demo peer",

        endpoint: demoEndpoint,

        connectedAt: new Date().toISOString(),

      };

      const next = [...loadContacts().filter((c) => c.did !== contact.did), contact];

      saveContacts(next);



      const client = new CommsAgentClient(personalAdmin, token);

      try {

        await client.connectPeer(demoEndpoint, demoDid);

      } catch (error) {

        const explained = explainConnectError(error, personalAdmin);

        if (explained) throw new Error(explained);

      }

      if (IS_DEMO_MODE) {

        await requestDemoSchedulingProposal(personalAdmin, token);

      }



      finish();

      onOpenComms?.();

    } catch (error) {

      setStatus(error instanceof Error ? error.message : String(error));

    } finally {

      setBusy(false);

    }

  }



  async function submitHosted() {

    setBusy(true);

    setStatus(null);

    try {

      const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/signup`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          email: email.trim(),
          ...(ownerHandle.trim() ? { handle: normalizeOwnerHandle(ownerHandle) } : {}),
        }),

      });

      const data = (await resp.json()) as {

        agentUrl?: string;

        adminToken?: string;

        custodyNotice?: string;

        message?: string;

        error?: string;

      };

      if (!resp.ok) throw new Error(data.error ?? `Signup failed (${resp.status})`);

      setStatus(

        [data.custodyNotice, data.message].filter(Boolean).join(" ") ||

          "Hosted agent provisioned.",

      );

      if (data.agentUrl) {

        await finishWithConfig({

          adminUrl: data.agentUrl.replace(/\/$/, ""),

          adminToken: data.adminToken,

        }, "hosted");

      }

    } catch (error) {

      const message = error instanceof Error ? error.message : String(error);

      if (/failed to fetch|connection refused|networkerror/i.test(message)) {
        setStatus(
          SHOW_DEV_WORKFLOWS
            ? `Cannot reach the control plane at ${CONTROL_PLANE_URL}. Run pnpm dev:hosting in the repo and leave that terminal open.`
            : `Cannot reach signup right now. Try again in a few minutes.`,
        );
      } else {

        setStatus(message);

      }

    } finally {

      setBusy(false);

    }

  }



  function statusLabel(state: ServiceStatus, ready: string, missing: string): string {

    if (state === "ready") return ready;

    if (state === "missing") return missing;

    return "Checking…";

  }



  const demoReady = personalStatus === "ready" && peerStatus === "ready";

  const canConnectDemo = IS_DEMO_MODE

    ? demoReady

    : personalUrl.trim() && personalToken.trim() && personalStatus === "ready" && peerStatus === "ready";



  const hostedStackReady = MANAGED_HOSTING
    ? controlPlaneStatus === "ready"
    : controlPlaneStatus === "ready" && hostedAgentStatus === "ready";
  const hostedHandleReady =
    !ownerHandle.trim() || Boolean(handleStatus?.includes("is available"));



  return (

    <div className="chrome-overlay settings-overlay" role="dialog" aria-modal="true">

      <div className="settings-dialog first-run-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="settings-dialog-header">

          <h2>
            {mode === "demo-peer" && IS_DEMO_MODE
              ? "Atom demo"
              : mode === "self-host"
                ? "Connect your agent"
                : mode === "hosted"
                  ? MANAGED_HOSTING
                    ? "Create your account"
                    : "Hosted signup (dev)"
                  : "Connect your agent"}
          </h2>

        </div>

        <div className="settings-dialog-body">

          {mode === "choose" ? (

            <>

              {MANAGED_HOSTING ? (
                <>
                  <p className="settings-note">
                    Atom runs in your browser. Enter your email and we provision a personal agent on
                    Qwixl infrastructure — nothing to install on your computer.
                  </p>
                  <div className="first-run-actions">
                    <button type="button" className="chrome-approve" onClick={() => setMode("hosted")}>
                      Create account
                    </button>
                  </div>
                </>
              ) : (
                <>
              <p className="settings-note">
                Link Atom to your personal agent so you can message people, join rooms, and keep your
                profile in sync.
              </p>

              {localDevAgentUrl ? (
                <p className="settings-note first-run-status-ready">
                  We found an agent on this device. Connect below and enter your connection token.
                </p>
              ) : (
                <p className="settings-note">
                  Try the demo to explore, or connect with the URL and token from your agent setup.
                </p>
              )}

              <div className="first-run-actions">

                <button
                  type="button"
                  className="chrome-approve"
                  onClick={() => {
                    if (localDevAgentUrl) setAdminUrl(localDevAgentUrl);
                    setMode("self-host");
                  }}
                >
                  {localDevAgentUrl ? "Connect" : "Connect my agent"}
                </button>

                {SHOW_DEMO_PEER ? (
                <button type="button" className="chrome-approve" onClick={() => setMode("demo-peer")}>

                  Try demo peer (2 min)

                </button>
                ) : null}

                {SHOW_DEV_WORKFLOWS ? (
                  <button type="button" className="chrome-decline" onClick={() => setMode("hosted")}>

                    Hosted signup (dev stack only)

                  </button>
                ) : null}

                <button type="button" className="chrome-decline" onClick={() => finish()}>

                  Skip for now

                </button>

              </div>
                </>
              )}

            </>

          ) : null}



          {mode === "demo-peer" && SHOW_DEMO_PEER ? (

            <>

              {IS_DEMO_MODE ? (

                <>

                  <p className="settings-note demo-intro">

                    A business agent sends your personal agent an encrypted meeting proposal (MLS).
                    You accept a time in <strong>shell confirmation chrome</strong> — not inside an
                    agent-composed UI. That separation is what Atom demonstrates.

                  </p>

                  <p className="settings-note">

                    When both checks below are ready, click <strong>Connect to demo</strong>. The
                    guided walkthrough opens — no need to hunt for Comms or refresh your inbox.

                  </p>

                </>

              ) : (

                <>

                  <p className="settings-note">

                    Run the demo with <strong>one command</strong> (starts shell, your agent, and

                    the demo peer together):

                  </p>

                  <ol className="settings-note first-run-steps">

                    <li>

                      Stop any separate <code>pnpm dev</code> / <code>pnpm dev:demo-peer</code>{" "}

                      terminals (Ctrl+C).

                    </li>

                    <li>

                      In the project folder, run <code>pnpm dev:demo</code> and leave that

                      terminal open.

                    </li>

                    <li>

                      Open <a href={SHELL_URL}>{SHELL_URL}</a> and return here.

                    </li>

                    <li>When both checks below are ready, click <strong>Connect to demo</strong>.</li>

                  </ol>

                </>

              )}



              <ul className="first-run-status-list">

                <li className={personalStatus === "ready" ? "first-run-status-ready" : ""}>

                  Your agent ({demoPersonalAgentUrl()}):{" "}

                  {statusLabel(

                    personalStatus,

                    "Ready",

                    IS_DEMO_MODE ? "Not running — restart pnpm dev:demo" : "Not running — run pnpm dev:demo",

                  )}

                </li>

                <li className={peerStatus === "ready" ? "first-run-status-ready" : ""}>

                  Demo peer ({demoPeerAdminUrl()}):{" "}

                  {statusLabel(

                    peerStatus,

                    "Ready",

                    IS_DEMO_MODE ? "Not running — restart pnpm dev:demo" : "Not running — run pnpm dev:demo",

                  )}

                </li>

              </ul>



              {!IS_DEMO_MODE ? (

                <button

                  type="button"

                  className="chrome-decline first-run-advanced-toggle"

                  onClick={() => setShowAdvanced((v) => !v)}

                >

                  {showAdvanced ? "Hide manual setup" : "Manual setup (developers only)"}

                </button>

              ) : null}



              {!IS_DEMO_MODE && showAdvanced ? (

                <>

                  <label className="atom-field">

                    <span className="atom-field-label">Your agent admin URL</span>

                    <input value={personalUrl} onChange={(e) => setPersonalUrl(e.target.value)} />

                  </label>

                  <label className="atom-field">

                    <span className="atom-field-label">Your admin bearer token</span>

                    <input

                      type="password"

                      value={personalToken}

                      onChange={(e) => setPersonalToken(e.target.value)}

                      autoComplete="off"

                    />

                  </label>

                </>

              ) : null}



              {status ? <p className="shell-comms-error">{status}</p> : null}

              <div className="chrome-actions settings-section-actions">

                <button

                  type="button"

                  className="chrome-approve"

                  disabled={busy || !canConnectDemo}

                  onClick={() => void submitDemoPeer()}

                >

                  {busy ? "Connecting…" : "Connect to demo"}

                </button>

                <button type="button" className="chrome-decline" onClick={() => setMode("choose")}>

                  Back

                </button>

              </div>

            </>

          ) : null}



          {mode === "hosted" ? (

            <>

              <p className="settings-note">
                {MANAGED_HOSTING
                  ? "Your agent runs on Qwixl infrastructure. You can export your data and move to self-hosting any time from Settings."
                  : "A hosted agent means the operator holds your keys and store. You can export and self-host when you want."}
              </p>
              {SHOW_DEV_WORKFLOWS ? (
                <>
                  <p className="settings-note">
                    Local dev requires the hosting stack. In the repo run{" "}
                    <code>pnpm dev:hosting</code> and leave that terminal open.
                  </p>
                  <p className="settings-note">
                    Your email creates your hosted account handle. No email is sent in this local dev
                    stack.
                  </p>
                  <ul className="first-run-status-list">
                    <li className={controlPlaneStatus === "ready" ? "first-run-status-ready" : ""}>
                      Control plane ({CONTROL_PLANE_URL}):{" "}
                      {statusLabel(
                        controlPlaneStatus,
                        "Ready",
                        "Not running — run pnpm dev:hosting",
                      )}
                    </li>
                    <li className={hostedAgentStatus === "ready" ? "first-run-status-ready" : ""}>
                      Hosted agent ({hostedStubAgentUrl()}):{" "}
                      {statusLabel(
                        hostedAgentStatus,
                        "Ready",
                        "Not running — run pnpm dev:hosting",
                      )}
                    </li>
                  </ul>
                  {localDevAgentUrl && hostedAgentStatus !== "ready" ? (
                    <p className="settings-note">
                      You already have a local agent.{" "}
                      <button
                        type="button"
                        className="panel-btn-ghost"
                        onClick={() => {
                          setAdminUrl(localDevAgentUrl);
                          setMode("self-host");
                        }}
                      >
                        Connect it here
                      </button>{" "}
                      with your connection token.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="settings-note">
                  Enter your email to create your hosted agent. Connection is set up automatically —
                  no URLs or tokens to copy.
                </p>
              )}
              {MANAGED_HOSTING && controlPlaneFleetMode === "unconfigured" ? (
                <p className="settings-note comms-status-error">
                  Hosted signup is not available on the control plane yet. Please try again later.
                </p>
              ) : null}

              <label className="atom-field">

                <span className="atom-field-label">Email</span>

                <input value={email} onChange={(e) => setEmail(e.target.value)} />

              </label>

              <label className="atom-field">

                <span className="atom-field-label">Your @handle</span>

                <input
                  value={ownerHandle}
                  onChange={(e) => setOwnerHandle(e.target.value)}
                  placeholder={email.trim() ? `@${bareOwnerHandle(email)}` : "@your-name"}
                />

              </label>

              {handleStatus ? <p className="settings-note">{handleStatus}</p> : null}

              {status ? <p className="settings-note">{status}</p> : null}

              <div className="chrome-actions settings-section-actions">

                <button

                  type="button"

                  className="chrome-approve"

                  disabled={
                    busy ||
                    !email.includes("@") ||
                    !hostedStackReady ||
                    !hostedHandleReady ||
                    (MANAGED_HOSTING && controlPlaneFleetMode === "unconfigured")
                  }

                  onClick={() => void submitHosted()}

                >

                  {busy ? "Creating account…" : MANAGED_HOSTING ? "Create account" : "Sign up (beta)"}

                </button>

                <button type="button" className="chrome-decline" onClick={() => setMode("choose")}>

                  Back

                </button>

              </div>

            </>

          ) : null}



          {mode === "self-host" && !MANAGED_HOSTING ? (

            <>

              <p className="settings-note">
                Enter the URL and connection token from your agent setup.
              </p>

              <label className="atom-field">

                <span className="atom-field-label">Your @handle</span>

                <input
                  value={ownerHandle}
                  onChange={(e) => setOwnerHandle(e.target.value)}
                  placeholder="@your-name"
                />

              </label>

              {handleStatus ? <p className="settings-note">{handleStatus}</p> : null}

              <label className="atom-field">

                <span className="atom-field-label">Agent URL</span>

                <input value={adminUrl} onChange={(e) => setAdminUrl(e.target.value)} />

              </label>

              <label className="atom-field">

                <span className="atom-field-label">Connection token</span>

                <input

                  type="password"

                  value={adminToken}

                  onChange={(e) => setAdminToken(e.target.value)}

                />

              </label>

              <div className="chrome-actions settings-section-actions">

                <button
                  type="button"
                  className="chrome-approve"
                  disabled={
                    busy ||
                    !adminUrl.trim() ||
                    !adminToken.trim() ||
                    Boolean(ownerHandle.trim() && validateOwnerHandle(ownerHandle))
                  }
                  onClick={() => {
                    const handleError = ownerHandle.trim() ? validateOwnerHandle(ownerHandle) : null;
                    if (handleError) {
                      setStatus(handleError);
                      return;
                    }
                    setBusy(true);
                    void finishWithConfig({
                      adminUrl: adminUrl.trim(),
                      adminToken: adminToken.trim(),
                    }, "self-hosted")
                      .catch((error) => {
                        setStatus(error instanceof Error ? error.message : String(error));
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Save connection
                </button>

                <button type="button" className="chrome-decline" onClick={() => setMode("choose")}>

                  Back

                </button>

              </div>

            </>

          ) : null}

        </div>

      </div>

    </div>

  );

}


