import { useEffect, useMemo, useState } from "react";
import {
  bootstrapHostedAccount,
  fetchHostedAgentConnection,
  getSupabaseClient,
  signupHostedDevAccount,
} from "./hostedAccount.js";
import { completeAgentSetup } from "./completeSetup.js";
import { AuthStepper } from "./AuthStepper.js";
import {
  authSteps,
  stepIndex,
  stepLabel,
  type AuthStepId,
  type AuthWizardMode,
  type HostingType,
} from "./authSteps.js";
import {
  bareOwnerHandle,
  normalizeOwnerHandle,
  validateOwnerHandle,
} from "../ownerHandle.js";
import {
  ATOM_BROWSER_MODE,
  BROWSER_AGENT_API,
  browserAgentToken,
  CONTROL_PLANE_URL,
  IS_LOCAL_DEV,
  isHostedSignupAvailable,
  SHOW_DEV_WORKFLOWS,
  usesSupabaseHostedAuth,
} from "../hostConfig.js";
import { probeLocalDevAgentBase } from "../devAgentProbe.js";
import { defaultCommsAgentUrl, loadCommsAgentConfig } from "../comms/storage.js";
import { FieldLabelWithHint, LlmApiKeyHintContent } from "../ui/FieldHint.js";
import "./auth-wizard.css";

type AuthWizardProps = {
  mode: AuthWizardMode;
  onClose: () => void;
};

type ProvisionTask = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "error";
};

export function AuthWizard({ mode, onClose }: AuthWizardProps) {
  const steps = useMemo(() => authSteps(mode), [mode]);
  const [step, setStep] = useState<AuthStepId>(() => authSteps(mode)[0] ?? "credentials");

  const [hosting, setHosting] = useState<HostingType>(() =>
    isHostedSignupAvailable() ? "hosted" : "self-hosted",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [adminUrl, setAdminUrl] = useState(() => {
    if (ATOM_BROWSER_MODE) return BROWSER_AGENT_API;
    return loadCommsAgentConfig().adminUrl || defaultCommsAgentUrl();
  });
  const [adminToken, setAdminToken] = useState(
    () => browserAgentToken() ?? loadCommsAgentConfig().adminToken ?? "",
  );
  const [handleStatus, setHandleStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [provisionTasks, setProvisionTasks] = useState<ProvisionTask[]>([]);

  const labels = useMemo(
    () =>
      Object.fromEntries(steps.map((s) => [s, stepLabel(s)])) as Record<AuthStepId, string>,
    [steps],
  );

  const slideIndex = stepIndex(steps, step);

  useEffect(() => {
    if (hosting !== "hosted" || !handle.trim() || !isHostedSignupAvailable()) {
      setHandleStatus(null);
      return;
    }
    const validationError = validateOwnerHandle(handle);
    if (validationError) {
      setHandleStatus(validationError);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resp = await fetch(
            `${CONTROL_PLANE_URL.replace(/\/$/, "")}/handles/check?handle=${encodeURIComponent(normalizeOwnerHandle(handle))}`,
          );
          const data = (await resp.json()) as { available?: boolean; handle?: string };
          if (cancelled) return;
          if (data.available) {
            setHandleStatus(`${data.handle ?? normalizeOwnerHandle(handle)} is available`);
          } else {
            setHandleStatus("Handle is already taken");
          }
        } catch {
          if (!cancelled) {
            setHandleStatus("Handle check unavailable — is the control plane running?");
          }
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, hosting]);

  useEffect(() => {
    if (hosting !== "self-hosted" || !SHOW_DEV_WORKFLOWS) return;
    void probeLocalDevAgentBase().then((url) => {
      if (url) setAdminUrl(url);
    });
  }, [hosting]);

  function goTo(next: AuthStepId) {
    setStep(next);
    setError(null);
  }

  function goNext() {
    const idx = slideIndex;
    const next = steps[idx + 1];
    if (next) goTo(next);
  }

  function goBack() {
    const idx = slideIndex;
    const prev = steps[idx - 1];
    if (prev) goTo(prev);
  }

  async function runProvisioning(): Promise<void> {
    setBusy(true);
    setError(null);
    const tasks: ProvisionTask[] = (() => {
      if (ATOM_BROWSER_MODE || (mode === "register" && hosting === "self-hosted")) {
        return [
          { id: "agent", label: "Validating agent connection", state: "active" },
          { id: "connect", label: "Connecting shell", state: "pending" },
        ];
      }
      if (mode === "login") {
        return [{ id: "connect", label: "Connecting to your agent", state: "active" }];
      }
      return [
        { id: "auth", label: "Creating account", state: "active" },
        { id: "agent", label: "Provisioning agent", state: "pending" },
        { id: "connect", label: "Connecting shell", state: "pending" },
      ];
    })();
    setProvisionTasks(tasks);

    const updateTask = (id: string, state: ProvisionTask["state"]) => {
      setProvisionTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, state } : t)),
      );
    };

    const advanceTask = (doneId: string, nextId?: string) => {
      updateTask(doneId, "done");
      if (nextId) updateTask(nextId, "active");
    };

    try {
      const useHostedFlow =
        !ATOM_BROWSER_MODE && (hosting === "hosted" || mode === "login");

      if (useHostedFlow) {
        if (!usesSupabaseHostedAuth()) {
          if (mode !== "register") {
            throw new Error("Hosted login requires Supabase. Use self-hosted or configure VITE_SUPABASE_* in .env.local.");
          }
          advanceTask("auth", "agent");
          const connection = await signupHostedDevAccount({
            email: email.trim(),
            handle: normalizeOwnerHandle(handle),
          });
          advanceTask("agent", "connect");
          await completeAgentSetup({
            adminUrl: connection.adminUrl,
            adminToken: connection.adminToken,
            handle: bareOwnerHandle(connection.handle),
            kind: "hosted",
          });
          updateTask("connect", "done");
        } else {
        if (!isHostedSignupAvailable()) {
          throw new Error(
            "Account signup is temporarily unavailable. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, or choose Self hosted.",
          );
        }
        const supabase = getSupabaseClient();

        if (mode === "register") {
          const { error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });
          if (signUpError) throw signUpError;

          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw signInError;

          advanceTask("auth", "agent");

          await bootstrapHostedAccount({
            handle: bareOwnerHandle(handle),
            accountType: "user",
            llmApiKey: llmApiKey.trim(),
          });
          advanceTask("agent", "connect");
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw signInError;
        }

        const connection = await fetchHostedAgentConnection();
        if (mode === "register") advanceTask("connect", undefined);
        else updateTask("connect", "done");

        await completeAgentSetup({
          adminUrl: connection.adminUrl,
          adminToken: connection.adminToken,
          handle: connection.handle ?? bareOwnerHandle(handle),
          kind: "hosted",
        });
        }
      } else {
        if (!adminUrl.trim() || !adminToken.trim()) {
          throw new Error("Agent URL and connection token are required.");
        }
        advanceTask("agent", "connect");
        await completeAgentSetup({
          adminUrl: adminUrl.trim(),
          adminToken: adminToken.trim(),
          handle: handle.trim() ? bareOwnerHandle(handle) : undefined,
          kind: "self-hosted",
        });
        updateTask("connect", "done");
      }

      window.location.replace("/app/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setProvisionTasks((prev) =>
        prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
      );
    } finally {
      setBusy(false);
    }
  }

  function validateCredentials(): boolean {
    if (mode === "register" && hosting === "self-hosted") {
      return true;
    }
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return false;
    }
    if (usesSupabaseHostedAuth() && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return false;
    }
    if (mode === "register" && hosting === "hosted" && !isHostedSignupAvailable()) {
      setError(
        "Hosted signup is unavailable. Choose Self hosted, or add Supabase keys to .env.local and run pnpm dev:hosting.",
      );
      return false;
    }
    if (mode === "login" && !usesSupabaseHostedAuth()) {
      setError(
        "Hosted login requires Supabase. Connect a self-hosted agent instead.",
      );
      return false;
    }
    return true;
  }

  function validateProfile(): boolean {
    const handleError = validateOwnerHandle(handle);
    if (handleError) {
      setError(handleError);
      return false;
    }
    if (hosting === "hosted") {
      if (!llmApiKey.trim()) {
        setError("Add your LLM API key to continue.");
        return false;
      }
      if (handleStatus?.includes("taken")) {
        setError("Choose a different handle.");
        return false;
      }
    } else if (!adminUrl.trim() || !adminToken.trim()) {
      setError("Agent URL and connection token are required.");
      return false;
    }
    return true;
  }

  function handlePrimary() {
    setError(null);
    if (step === "hosting") {
      goNext();
      return;
    }
    if (step === "credentials") {
      if (!validateCredentials()) return;
      if (mode === "login") {
        goTo("provisioning");
        void runProvisioning();
      } else {
        goNext();
      }
      return;
    }
    if (step === "profile") {
      if (!validateProfile()) return;
      goTo("provisioning");
      void runProvisioning();
    }
  }

  const title = mode === "register" ? "Create account" : "Log in";

  function renderStepPanel(stepId: AuthStepId) {
    switch (stepId) {
      case "hosting":
        return (
          <>
            <h3 className="auth-slide-title">How will you run your agent?</h3>
            <p className="auth-slide-desc">
              Hosted agents run on Qwixl infrastructure. Self-hosted agents run on your own server.
            </p>
            <div className="auth-radio-stack">
              <label className={`atom-radio-card${hosting === "hosted" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="hosting"
                  checked={hosting === "hosted"}
                  onChange={() => setHosting("hosted")}
                />
                <span>
                  <strong>Hosted</strong>
                  <span>Qwixl runs your agent — no server setup.</span>
                  {IS_LOCAL_DEV && !usesSupabaseHostedAuth() ? (
                    <span className="atom-note">
                      Local dev — uses the control plane stub started with pnpm dev.
                    </span>
                  ) : null}
                </span>
              </label>
              <label className={`atom-radio-card${hosting === "self-hosted" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="hosting"
                  checked={hosting === "self-hosted"}
                  onChange={() => setHosting("self-hosted")}
                />
                <span>
                  <strong>Self hosted</strong>
                  <span>Connect an agent you operate with URL and token.</span>
                </span>
              </label>
            </div>
          </>
        );
      case "credentials":
        return (
          <>
            <h3 className="auth-slide-title">
              {mode === "register" ? "Your account" : "Welcome back"}
            </h3>
            <p className="auth-slide-desc">
              {mode === "register" && hosting === "self-hosted"
                ? "Optional for self-hosted — your agent credentials are on the next step."
                : IS_LOCAL_DEV && hosting === "hosted" && !usesSupabaseHostedAuth()
                  ? "Email for your hosted dev account. Password is not used locally."
                  : "Email and password for your Atom identity."}
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {usesSupabaseHostedAuth() || mode === "login" ? (
              <label className="atom-field">
                <span className="atom-field-label">Password</span>
                <input
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            ) : null}
          </>
        );
      case "profile":
        return (
          <>
            <h3 className="auth-slide-title">Profile & keys</h3>
            <p className="auth-slide-desc">
              {hosting === "hosted"
                ? "Your public handle and LLM provider key."
                : ATOM_BROWSER_MODE
                  ? "Your handle and local agent connection (pre-filled for this dev session)."
                  : "Your handle and agent connection details."}
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Handle</span>
              <input
                value={handle}
                onChange={(e) => setHandle(normalizeOwnerHandle(e.target.value))}
                placeholder="@you"
              />
            </label>
            {handleStatus ? <p className="atom-note">{handleStatus}</p> : null}

            {hosting === "hosted" ? (
              <label className="atom-field">
                <FieldLabelWithHint label="LLM API key" hint={<LlmApiKeyHintContent />} />
                <input
                  type="password"
                  autoComplete="off"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="sk-…"
                />
              </label>
            ) : (
              <>
                <label className="atom-field">
                  <span className="atom-field-label">Agent URL</span>
                  <input
                    value={adminUrl}
                    onChange={(e) => setAdminUrl(e.target.value)}
                    placeholder="https://your-agent.example.com"
                    readOnly={ATOM_BROWSER_MODE}
                  />
                </label>
                <label className="atom-field">
                  <span className="atom-field-label">Connection token</span>
                  <input
                    type="password"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                    readOnly={ATOM_BROWSER_MODE}
                  />
                </label>
                {ATOM_BROWSER_MODE ? (
                  <p className="atom-note">
                    Connected via <code>{BROWSER_AGENT_API}</code>. Add an LLM key in Settings after setup.
                  </p>
                ) : SHOW_DEV_WORKFLOWS ? (
                  <p className="atom-note">
                    Local dev: run <code>pnpm start:agent</code> then paste URL and token.
                  </p>
                ) : null}
              </>
            )}
          </>
        );
      case "provisioning":
        return (
          <>
            <h3 className="auth-slide-title">Setting up</h3>
            <p className="auth-slide-desc">
              {busy ? "This usually takes a few seconds." : "Ready to connect."}
            </p>
            {provisionTasks.length > 0 ? (
              <ul className="auth-provision-list">
                {provisionTasks.map((task) => (
                  <li key={task.id}>
                    {task.state === "active" ? (
                      <span className="auth-spinner" aria-hidden="true" />
                    ) : (
                      <span
                        className={`atom-status-dot atom-status-dot--${
                          task.state === "done"
                            ? "ready"
                            : task.state === "error"
                              ? "pending"
                              : "pending"
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    {task.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        );
    }
  }

  return (
    <div className="chrome-overlay auth-modal-overlay atom-auth-modal" role="dialog" aria-modal="true">
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{title}</h2>
          <button type="button" className="auth-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="auth-modal-body">
          <AuthStepper steps={steps} current={step} labels={labels} />

          <div className="auth-slides">
            <div
              className="auth-slides-track"
              style={{ transform: `translateX(-${slideIndex * 100}%)` }}
            >
              {steps.map((stepId) => (
                <section
                  key={stepId}
                  className="auth-slide"
                  aria-hidden={step !== stepId}
                >
                  {renderStepPanel(stepId)}
                </section>
              ))}
            </div>
          </div>

          {error ? <p className="atom-note atom-note-error">{error}</p> : null}

          {step !== "provisioning" ? (
            <div className="auth-actions">
              <button
                type="button"
                className="atom-btn atom-btn-primary"
                disabled={busy}
                onClick={handlePrimary}
              >
                {step === "profile" || (step === "credentials" && mode === "login")
                  ? mode === "login"
                    ? "Log in"
                    : "Create account"
                  : "Continue"}
              </button>
              {slideIndex > 0 ? (
                <button type="button" className="atom-btn atom-btn-secondary" onClick={goBack}>
                  Back
                </button>
              ) : null}
            </div>
          ) : error && !busy ? (
            <div className="auth-actions">
              <button
                type="button"
                className="atom-btn atom-btn-primary"
                onClick={() => {
                  goTo(mode === "login" ? "credentials" : "profile");
                }}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
