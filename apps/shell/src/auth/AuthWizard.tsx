import { useEffect, useMemo, useRef, useState } from "react";
import {
  bootstrapHostedAccount,
  clearStaleSupabaseSession,
  fetchHostedAgentConnection,
  fetchHostedAccountStatus,
  friendlyHostedProvisionError,
  getSupabaseClient,
  hasSupabaseSession,
  isEmailNotConfirmedError,
  isEmailRateLimitError,
  registerSupabaseAccount,
  resendSignupConfirmation,
  signInSupabaseAccount,
  signupHostedDevAccount,
  type AtomAccountType,
} from "./hostedAccount.js";
import { saveAccountType } from "../accountType.js";
import { completeAgentSetup } from "./completeSetup.js";
import { loadFirstRunDone } from "../firstRunStorage.js";
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
  loadOwnerHandle,
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
import {
  defaultHostedLlmConnectionFields,
  HostedLlmConnectionFields,
  type HostedLlmConnectionFieldsValue,
} from "../settings/HostedLlmConnectionFields.js";
import { resolveHostedLlmConnection } from "../settings/llmProviderPresets.js";
import {
  claimEmailConfirmation,
  subscribeToEmailConfirmed,
} from "./emailConfirmBridge.js";
import {
  releaseProvisioningLock,
  resolveHostedSignupFields,
  tryAcquireProvisioningLock,
} from "./hostedSignupLock.js";
import {
  clearPendingHostedAuth,
  clearSignupAtProvision,
  isSignupAtProvision,
  loadPendingHostedAuth,
  markSignupAtProvision,
  savePendingHostedAuth,
} from "./pendingHostedAuth.js";
import {
  PASSWORD_REQUIREMENTS_HINT,
  validatePasswordMatch,
  validatePasswordStrength,
} from "./passwordValidation.js";
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
  const [hosting, setHosting] = useState<HostingType>(() =>
    isHostedSignupAvailable() ? "hosted" : "self-hosted",
  );
  const [loginNeedsConfirm, setLoginNeedsConfirm] = useState(false);
  const [accountType, setAccountType] = useState<AtomAccountType>("user");

  const ACCOUNT_TYPES: { id: AtomAccountType; label: string; hint: string }[] = [
    { id: "user", label: "Personal", hint: "Everyday use — chat, messages, rooms" },
    { id: "business", label: "Business", hint: "Brand, catalog, and business agent" },
    { id: "developer", label: "Developer", hint: "Build modules and connectors" },
  ];

  const supabaseHostedRegister =
    mode === "register" && hosting === "hosted" && usesSupabaseHostedAuth();
  const supabaseHostedLogin = mode === "login" && usesSupabaseHostedAuth();

  const steps = useMemo(
    () =>
      loginNeedsConfirm && mode === "login"
        ? (["credentials", "confirm-email", "provisioning"] as AuthStepId[])
        : authSteps(mode, { supabaseHostedRegister, supabaseHostedLogin }),
    [mode, supabaseHostedRegister, supabaseHostedLogin, loginNeedsConfirm],
  );

  const [step, setStep] = useState<AuthStepId>(() => steps[0] ?? "credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [handle, setHandle] = useState(() =>
    mode === "login" ? (loadOwnerHandle() ?? "") : "",
  );
  const [llmConnection, setLlmConnection] = useState<HostedLlmConnectionFieldsValue>(() =>
    defaultHostedLlmConnectionFields("openai"),
  );
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
  const [emailConfirmedThanks, setEmailConfirmedThanks] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const confirmHandledRef = useRef(false);

  const labels = useMemo(
    () =>
      Object.fromEntries(steps.map((s) => [s, stepLabel(s)])) as Record<AuthStepId, string>,
    [steps],
  );

  const slideIndex = Math.max(0, stepIndex(steps, step));

  useEffect(() => {
    if (steps.includes(step)) return;
    const fallback = steps.includes("provisioning")
      ? "provisioning"
      : steps.includes("confirm-email")
        ? "confirm-email"
        : steps[0];
    if (fallback) goTo(fallback);
  }, [steps, step]);

  useEffect(() => {
    if (mode !== "register" || !usesSupabaseHostedAuth()) return;
    void clearStaleSupabaseSession();
  }, [mode]);

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
    if (!usesSupabaseHostedAuth()) return;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const resumeSetup = params.get("resume") === "1";
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const isReload = nav?.type === "reload";
      const reloadMidSetup = isReload && isSignupAtProvision();
      const hasSession = await hasSupabaseSession();
      const pending = loadPendingHostedAuth();

      if (hasSession && !loadFirstRunDone() && mode === "register") {
        if (pending) {
          setEmail(pending.email);
          if (pending.handle) setHandle(pending.handle);
          if (pending.llmApiKey) {
            setLlmConnection((prev) => ({
              ...prev,
              apiKey: pending.llmApiKey ?? prev.apiKey,
              providerId:
                pending.llmProvider === "openrouter" ||
                pending.llmProvider === "custom" ||
                pending.llmProvider === "openai"
                  ? pending.llmProvider
                  : prev.providerId,
              baseUrl: pending.llmBaseUrl ?? prev.baseUrl,
              model: pending.llmModel ?? prev.model,
            }));
          }
        }
        setHosting("hosted");
        goTo("provisioning");
        void resumeHostedSupabaseSetup();
        return;
      }

      if (!resumeSetup && !reloadMidSetup) {
        if (!hasSession) {
          clearPendingHostedAuth();
          clearSignupAtProvision();
          confirmHandledRef.current = false;
        }
        return;
      }

      if (!pending) return;

      setEmail(pending.email);
      if (pending.handle) setHandle(pending.handle);
      if (pending.llmApiKey) {
        setLlmConnection((prev) => ({
          ...prev,
          apiKey: pending.llmApiKey ?? prev.apiKey,
          providerId:
            pending.llmProvider === "openrouter" ||
            pending.llmProvider === "custom" ||
            pending.llmProvider === "openai"
              ? pending.llmProvider
              : prev.providerId,
          baseUrl: pending.llmBaseUrl ?? prev.baseUrl,
          model: pending.llmModel ?? prev.model,
        }));
      }
      if (pending.kind === "register") setHosting("hosted");

      if (hasSession) {
        goTo("provisioning");
        if (resumeSetup) {
          window.setTimeout(() => {
            if (pending.kind === "login") {
              void finishHostedSupabaseLogin();
            } else {
              void resumeHostedSupabaseSetup();
            }
          }, 800);
        }
      } else if (pending.kind === "register") {
        goTo("confirm-email");
      } else {
        setLoginNeedsConfirm(true);
        goTo("confirm-email");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (hosting !== "self-hosted" || !SHOW_DEV_WORKFLOWS) return;
    void probeLocalDevAgentBase().then((url) => {
      if (url) setAdminUrl(url);
    });
  }, [hosting]);

  useEffect(() => {
    if (step !== "confirm-email" || !usesSupabaseHostedAuth()) return;

    let cancelled = false;

    const continueAfterConfirm = async () => {
      if (cancelled || confirmHandledRef.current || !(await hasSupabaseSession())) return;
      confirmHandledRef.current = true;
      claimEmailConfirmation();
      setEmailConfirmedThanks(true);
      setError(null);
      window.setTimeout(() => {
        if (cancelled) return;
        goTo("provisioning");
        if (mode === "login") {
          void finishHostedSupabaseLogin();
        } else {
          void runHostedSupabaseProvisioning();
        }
      }, 800);
    };

    const unsubBridge = subscribeToEmailConfirmed(() => {
      void continueAfterConfirm();
    });

    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void continueAfterConfirm();
    });

    const interval = window.setInterval(() => void continueAfterConfirm(), 2500);
    void continueAfterConfirm();

    return () => {
      cancelled = true;
      unsubBridge();
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [step, mode]);

  function goTo(next: AuthStepId) {
    if (next === "provisioning") markSignupAtProvision();
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

  function initProvisionTasks(): ProvisionTask[] {
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
  }

  function updateTask(id: string, state: ProvisionTask["state"]) {
    setProvisionTasks((prev) => prev.map((t) => (t.id === id ? { ...t, state } : t)));
  }

  function advanceTask(doneId: string, nextId?: string) {
    updateTask(doneId, "done");
    if (nextId) updateTask(nextId, "active");
  }

  async function resumeHostedSupabaseSetup(): Promise<void> {
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already in progress. Wait a moment, then click Try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks([
      { id: "auth", label: "Creating account", state: "done" },
      { id: "agent", label: "Provisioning agent", state: "done" },
      { id: "connect", label: "Connecting shell", state: "active" },
    ]);

    try {
      if (!(await hasSupabaseSession())) {
        throw new Error("Sign in required — confirm your email first.");
      }

      const connection = await fetchHostedAgentConnection();
      const fields = resolveHostedSignupFields({
        email,
        handle,
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
      });
      await completeAgentSetup({
        adminUrl: connection.adminUrl,
        adminToken: connection.adminToken,
        handle: connection.handle ?? (fields ? bareOwnerHandle(fields.handle) : undefined),
        kind: "hosted",
        skipConnectionProbe: true,
      });
      updateTask("connect", "done");
      clearPendingHostedAuth();
      clearSignupAtProvision();
      window.location.replace("/app/");
    } catch (connectErr) {
      releaseProvisioningLock();
      const fields = resolveHostedSignupFields({
        email,
        handle,
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
      });
      if (fields) {
        await runHostedSupabaseProvisioning();
        return;
      }
      const raw = connectErr instanceof Error ? connectErr.message : String(connectErr);
      setError(friendlyHostedProvisionError(raw));
      setProvisionTasks((prev) =>
        prev.map((t) => (t.id === "connect" ? { ...t, state: "error" } : t)),
      );
      setBusy(false);
    } finally {
      releaseProvisioningLock();
    }
  }

  async function runHostedSupabaseProvisioning(): Promise<void> {
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already in progress. Wait a moment, then click Try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks(initProvisionTasks());

    try {
      if (!(await hasSupabaseSession())) {
        throw new Error("Sign in required — confirm your email first.");
      }

      const fields = resolveHostedSignupFields({
        email,
        handle,
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
      });
      if (!fields) {
        throw new Error("Signup details missing — go back to Profile and try again.");
      }

      advanceTask("auth", "agent");
      await bootstrapHostedAccount({
        handle: bareOwnerHandle(fields.handle),
        accountType,
        llmApiKey: fields.llmApiKey,
        llmProvider: fields.llmProvider,
        llmBaseUrl: fields.llmBaseUrl,
        llmModel: fields.llmModel,
      });
      advanceTask("agent", "connect");
      const connection = await fetchHostedAgentConnection();
      await completeAgentSetup({
        adminUrl: connection.adminUrl,
        adminToken: connection.adminToken,
        handle: connection.handle ?? bareOwnerHandle(fields.handle),
        kind: "hosted",
        skipConnectionProbe: true,
      });
      saveAccountType(accountType);
      updateTask("connect", "done");
      clearPendingHostedAuth();
      clearSignupAtProvision();
      window.location.replace("/app/");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyHostedProvisionError(raw));
      setProvisionTasks((prev) =>
        prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
      );
    } finally {
      releaseProvisioningLock();
      setBusy(false);
    }
  }

  async function finishHostedSupabaseLogin(): Promise<void> {
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already in progress. Wait a moment, then click Try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks([{ id: "connect", label: "Connecting to your agent", state: "active" }]);

    try {
      const connection = await fetchHostedAgentConnection();
      await completeAgentSetup({
        adminUrl: connection.adminUrl,
        adminToken: connection.adminToken,
        handle: connection.handle,
        kind: "hosted",
        skipConnectionProbe: true,
      });
      try {
        const status = await fetchHostedAccountStatus();
        if (status.accountType) saveAccountType(status.accountType);
      } catch {
        /* optional */
      }
      updateTask("connect", "done");
      clearPendingHostedAuth();
      clearSignupAtProvision();
      window.location.replace("/app/");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyHostedProvisionError(raw));
      setProvisionTasks((prev) =>
        prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
      );
    } finally {
      releaseProvisioningLock();
      setBusy(false);
    }
  }

  async function submitProfileStep(): Promise<void> {
    if (!validateProfile()) return;

    if (usesSupabaseHostedAuth() && hosting === "hosted" && mode === "register") {
      setBusy(true);
      setError(null);
      savePendingHostedAuth({
        kind: "register",
        email: email.trim(),
        handle,
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
      });
      try {
        if (await hasSupabaseSession()) {
          goTo("provisioning");
          await runHostedSupabaseProvisioning();
          return;
        }

        const { needsEmailConfirmation, note } = await registerSupabaseAccount(email, password);
        setEmailConfirmedThanks(false);
        if (needsEmailConfirmation) {
          goTo("confirm-email");
          if (note) setResendNote(note);
        } else {
          goTo("provisioning");
          await runHostedSupabaseProvisioning();
        }
      } catch (err) {
        if (isEmailRateLimitError(err)) {
          goTo("confirm-email");
          setResendNote(
            "Too many emails sent recently. Check your inbox for an existing confirmation link.",
          );
          setError(null);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    goTo("provisioning");
    await runProvisioning();
  }

  async function resendConfirmationEmail(): Promise<void> {
    setResendNote(null);
    setError(null);
    try {
      const pending = loadPendingHostedAuth();
      const authKind = pending?.kind ?? (mode === "login" ? "login" : "register");
      await resendSignupConfirmation(email, authKind);
      setResendNote("Confirmation email sent — check your inbox.");
    } catch (err) {
      if (isEmailRateLimitError(err)) {
        setResendNote("Too many emails sent recently — wait a few minutes, or use the link already in your inbox.");
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runProvisioning(): Promise<void> {
    setBusy(true);
    setError(null);
    setProvisionTasks(initProvisionTasks());

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

          if (mode === "login") {
            try {
              await signInSupabaseAccount(email, password);
            } catch (err) {
              if (isEmailNotConfirmedError(err)) {
                setLoginNeedsConfirm(true);
                setEmailConfirmedThanks(false);
                savePendingHostedAuth({ kind: "login", email: email.trim() });
                setBusy(false);
                setProvisionTasks([]);
                goTo("confirm-email");
                return;
              }
              throw err;
            }
            await finishHostedSupabaseLogin();
            return;
          }

          await runHostedSupabaseProvisioning();
          return;
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
        if (mode === "register") saveAccountType(accountType);
        updateTask("connect", "done");
      }

      clearPendingHostedAuth();
      clearSignupAtProvision();
      window.location.replace("/app/");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(friendlyHostedProvisionError(raw));
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
    if (usesSupabaseHostedAuth() || mode === "login") {
      if (!password) {
        setError("Enter your password.");
        return false;
      }
      if (mode === "register") {
        const strengthError = validatePasswordStrength(password);
        if (strengthError) {
          setError(strengthError);
          return false;
        }
        const matchError = validatePasswordMatch(password, confirmPassword);
        if (matchError) {
          setError(matchError);
          return false;
        }
      }
    }
    if (mode === "register" && hosting === "hosted" && !isHostedSignupAvailable()) {
      setError(
        "Hosted signup is unavailable. Choose Self hosted, or add Supabase keys to .env.local and run pnpm dev:hosting.",
      );
      return false;
    }
    if (mode === "login" && !usesSupabaseHostedAuth()) {
      return true;
    }
    return true;
  }

  function validateProfile(): boolean {
    const handleError = validateOwnerHandle(handle);
    if (handleError) {
      setError(handleError);
      return false;
    }
    if (mode === "login") {
      if (!adminUrl.trim() || !adminToken.trim()) {
        setError("Agent URL and connection token are required.");
        return false;
      }
      return true;
    }
    if (hosting === "hosted") {
      if (!llmConnection.apiKey.trim()) {
        setError("Add your LLM API key to continue.");
        return false;
      }
      const resolved = resolveHostedLlmConnection({
        providerId: llmConnection.providerId,
        baseUrl: llmConnection.baseUrl,
        model: llmConnection.model,
      });
      if (!resolved.baseUrl.trim() || !resolved.model.trim()) {
        setError(
          llmConnection.providerId === "custom"
            ? "Add an endpoint base URL and model id."
            : "Choose a model for your provider.",
        );
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
    if (step === "account-type") {
      goNext();
      return;
    }
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
      if (mode === "login") {
        if (!validateProfile()) return;
        goTo("provisioning");
        void runProvisioning();
      } else {
        void submitProfileStep();
      }
      return;
    }
  }

  const title = mode === "register" ? "Create account" : "Log in";

  function renderStepPanel(stepId: AuthStepId) {
    switch (stepId) {
      case "account-type":
        return (
          <>
            <h3 className="auth-slide-title">What kind of account?</h3>
            <p className="auth-slide-desc">
              Personal for everyday use, Business for a brand agent, Developer for building modules.
            </p>
            <div className="auth-radio-stack">
              {ACCOUNT_TYPES.map((type) => (
                <label
                  key={type.id}
                  className={`atom-radio-card${accountType === type.id ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    checked={accountType === type.id}
                    onChange={() => setAccountType(type.id)}
                  />
                  <span>
                    <strong>{type.label}</strong>
                    <span>{type.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        );
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
              <>
                <label className="atom-field">
                  <span className="atom-field-label">Password</span>
                  <input
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {mode === "register" ? (
                  <>
                    <label className="atom-field">
                      <span className="atom-field-label">Confirm password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </label>
                    <p className="atom-note">{PASSWORD_REQUIREMENTS_HINT}</p>
                  </>
                ) : null}
              </>
            ) : null}
          </>
        );
      case "profile":
        return (
          <>
            <h3 className="auth-slide-title">
              {mode === "login" ? "Welcome back" : "Profile & keys"}
            </h3>
            <p className="auth-slide-desc">
              {mode === "login"
                ? ATOM_BROWSER_MODE
                  ? "Confirm your handle and reconnect to your local agent."
                  : "Reconnect your self-hosted agent."
                : hosting === "hosted"
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

            {mode === "register" && hosting === "hosted" ? (
              <HostedLlmConnectionFields value={llmConnection} onChange={setLlmConnection} />
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
                    Connected via <code>{BROWSER_AGENT_API}</code>. Set Chat provider and LLM key in
                    Settings after setup.
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
      case "confirm-email":
        return emailConfirmedThanks ? (
          <>
            <h3 className="auth-slide-title">Email confirmed</h3>
            <p className="auth-slide-desc auth-confirm-thanks">
              Thanks — your email is verified. Setting up your account now…
            </p>
            <span className="auth-spinner" aria-hidden="true" />
          </>
        ) : (
          <>
            <h3 className="auth-slide-title">Check your email</h3>
            <p className="auth-slide-desc">
              We sent a confirmation link to <strong>{email}</strong>. Open it to continue — this
              page will pick up automatically once you confirm.
            </p>
            <p className="atom-note">
              The link returns you here. You can leave this tab open while you check your inbox.
            </p>
            {resendNote ? <p className="atom-note">{resendNote}</p> : null}
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

          {step !== "provisioning" && step !== "confirm-email" ? (
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
          ) : step === "confirm-email" && !emailConfirmedThanks ? (
            <div className="auth-actions">
              <button
                type="button"
                className="atom-btn atom-btn-primary"
                disabled={busy}
                onClick={() => void resendConfirmationEmail()}
              >
                Resend email
              </button>
              {slideIndex > 0 ? (
                <button type="button" className="atom-btn atom-btn-secondary" onClick={goBack}>
                  Back
                </button>
              ) : null}
            </div>
          ) : null}

          {step === "provisioning" && error && !busy ? (
            <div className="auth-actions">
              <button
                type="button"
                className="atom-btn atom-btn-primary"
                onClick={() => {
                  releaseProvisioningLock();
                  if (mode === "login") {
                    void finishHostedSupabaseLogin();
                  } else if (usesSupabaseHostedAuth() && hosting === "hosted") {
                    void resumeHostedSupabaseSetup();
                  } else {
                    goTo("profile");
                  }
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
