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
  startHostedPlanCheckout,
  SubscriptionRequiredError,
  type AtomAccountType,
} from "./hostedAccount.js";
import { saveAccountType } from "../accountType.js";
import { AccountTypeSelection } from "./accountTypeSelection.js";
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
import {
  BYOK_READINESS,
  MODEL_TIER_OPTIONS,
  STANDARD_READINESS,
  TOP_UP_OPTIONS_PENCE,
  hostingTypeForLane,
  parseLaneFromSearch,
  topUpHint,
  type BillingLane,
  type ModelTierId,
  type ReadinessSkuId,
} from "./planLanes.js";
import { fetchPlanCatalog, type RemotePlanCatalog } from "./fetchPlanCatalog.js";
import { clearDemoSession } from "../demo/demoSessionStorage.js";
import "./auth-wizard.css";

type AuthWizardProps = {
  mode: AuthWizardMode;
  onClose: () => void;
  embedded?: boolean;
};

type ProvisionTask = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "error";
};

function applyPendingAccountTypes(
  pending: { accountTypes?: AtomAccountType[]; accountType?: AtomAccountType },
  setPersonal: (v: boolean) => void,
  setDeveloper: (v: boolean) => void,
  setBusiness: (v: boolean) => void,
): void {
  try {
    const selection =
      pending.accountTypes && pending.accountTypes.length > 0
        ? AccountTypeSelection.fromAccountTypes(pending.accountTypes)
        : pending.accountType
          ? AccountTypeSelection.fromAccountTypes([pending.accountType])
          : null;
    if (!selection) return;
    setPersonal(selection.persona === "user");
    setDeveloper(selection.persona === "developer");
    setBusiness(selection.business);
  } catch {
    /* keep defaults */
  }
}

function applyPendingPlanFields(
  pending: {
    billingLane?: BillingLane;
    readinessSkuId?: ReadinessSkuId;
    modelTierId?: ModelTierId;
    topUpPence?: number;
  },
  setters: {
    setBillingLane: (v: BillingLane) => void;
    setReadinessSkuId: (v: ReadinessSkuId) => void;
    setModelTierId: (v: ModelTierId) => void;
    setTopUpPence: (v: number) => void;
    setHosting: (v: HostingType) => void;
  },
): void {
  if (pending.billingLane) {
    setters.setBillingLane(pending.billingLane);
    setters.setHosting(hostingTypeForLane(pending.billingLane));
  }
  if (pending.readinessSkuId) setters.setReadinessSkuId(pending.readinessSkuId);
  if (pending.modelTierId) setters.setModelTierId(pending.modelTierId);
  if (typeof pending.topUpPence === "number") setters.setTopUpPence(pending.topUpPence);
}

export function AuthWizard({ mode, onClose, embedded = false }: AuthWizardProps) {
  const initialLane = parseLaneFromSearch(typeof window !== "undefined" ? window.location.search : "");
  const [billingLane, setBillingLane] = useState<BillingLane>(() => {
    if (initialLane) return initialLane;
    return isHostedSignupAvailable() ? "standard" : "self_hosted";
  });
  const [readinessSkuId, setReadinessSkuId] = useState<ReadinessSkuId>("on_when_needed");
  const [modelTierId, setModelTierId] = useState<ModelTierId>("balanced");
  const [topUpPence, setTopUpPence] = useState(0);
  const [hosting, setHosting] = useState<HostingType>(() =>
    hostingTypeForLane(initialLane ?? (isHostedSignupAvailable() ? "standard" : "self_hosted")),
  );
  const [loginNeedsConfirm, setLoginNeedsConfirm] = useState(false);
  const [personal, setPersonal] = useState(true);
  const [developer, setDeveloper] = useState(false);
  const [business, setBusiness] = useState(false);

  const [remoteCatalog, setRemoteCatalog] = useState<RemotePlanCatalog | null>(null);

  useEffect(() => {
    if (mode !== "register") return;
    void fetchPlanCatalog().then(setRemoteCatalog);
  }, [mode]);

  useEffect(() => {
    if (!embedded) return;
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [embedded, onClose]);

  function currentAccountSelection(): AccountTypeSelection {
    return AccountTypeSelection.fromFlags({ personal, developer, business });
  }

  function navigateAfterAuthSuccess() {
    // Don't let a prior demo session in this tab hijack /app/ after real login.
    clearDemoSession();
    if (embedded) {
      window.parent.postMessage({ source: "atom-auth", type: "done" }, "*");
      return;
    }
    try {
      if (window.top) {
        window.top.location.href = "/app/";
        return;
      }
    } catch {
      /* cross-origin top — fall through */
    }
    window.location.replace("/app/");
  }

  function togglePersonal(checked: boolean) {
    if (checked) {
      setPersonal(true);
      setDeveloper(false);
    } else {
      setPersonal(false);
    }
  }

  function toggleDeveloper(checked: boolean) {
    if (checked) {
      setDeveloper(true);
      setPersonal(false);
    } else {
      setDeveloper(false);
    }
  }

  function selectBillingLane(lane: BillingLane) {
    setBillingLane(lane);
    setHosting(hostingTypeForLane(lane));
    setReadinessSkuId("on_when_needed");
    setTopUpPence(0);
  }

  const standardReadiness = remoteCatalog
    ? Object.values(remoteCatalog.lanes.standard.skus).map((s) => ({
        id: s.id as ReadinessSkuId,
        displayName: s.displayName,
        displayPrice: s.displayPrice,
        hint: remoteCatalog.lanes.standard.summary,
      }))
    : STANDARD_READINESS;
  const byokReadiness = remoteCatalog
    ? Object.values(remoteCatalog.lanes.byok.skus).map((s) => ({
        id: s.id as ReadinessSkuId,
        displayName: s.displayName,
        displayPrice: s.displayPrice,
        hint: remoteCatalog.lanes.byok.summary,
      }))
    : BYOK_READINESS;
  const topUpOptions = remoteCatalog
    ? ([0, ...remoteCatalog.topUpPacksPence] as number[])
    : [...TOP_UP_OPTIONS_PENCE];

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
      const billing = params.get("billing");
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const isReload = nav?.type === "reload";
      const reloadMidSetup = isReload && isSignupAtProvision();
      const hasSession = await hasSupabaseSession();
      const pending = loadPendingHostedAuth();

      const restorePending = (p: NonNullable<typeof pending>) => {
        setEmail(p.email);
        if (p.handle) setHandle(p.handle);
        applyPendingAccountTypes(p, setPersonal, setDeveloper, setBusiness);
        applyPendingPlanFields(p, {
          setBillingLane,
          setReadinessSkuId,
          setModelTierId,
          setTopUpPence,
          setHosting,
        });
        if (p.llmApiKey) {
          setLlmConnection((prev) => ({
            ...prev,
            apiKey: p.llmApiKey ?? prev.apiKey,
            providerId:
              p.llmProvider === "openrouter" ||
              p.llmProvider === "custom" ||
              p.llmProvider === "openai"
                ? p.llmProvider
                : prev.providerId,
            baseUrl: p.llmBaseUrl ?? prev.baseUrl,
            model: p.llmModel ?? prev.model,
          }));
        }
        if (p.kind === "register") setHosting("hosted");
      };

      if (billing === "plan-cancel" && mode === "register") {
        if (pending) restorePending(pending);
        setHosting("hosted");
        goTo("hosting");
        setError("Payment was cancelled. Your plan was not charged — pick a plan and continue when ready.");
        return;
      }

      if (billing === "plan-success" && mode === "register" && pending && hasSession) {
        restorePending(pending);
        setHosting("hosted");
        goTo("provisioning");
        void runHostedSupabaseProvisioning();
        return;
      }

      if (hasSession && !loadFirstRunDone() && mode === "register") {
        if (pending) restorePending(pending);
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

      restorePending(pending);

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
        billingLane: billingLane === "byok" ? "byok" : "standard",
      });
      await completeAgentSetup({
        adminUrl: connection.adminUrl,
        adminToken: connection.adminToken,
        sessionToken: connection.sessionToken,
        handle: connection.handle ?? (fields ? bareOwnerHandle(fields.handle) : undefined),
        kind: "hosted",
        skipConnectionProbe: true,
      });
      updateTask("connect", "done");
      clearPendingHostedAuth();
      clearSignupAtProvision();
      navigateAfterAuthSuccess();
    } catch (connectErr) {
      releaseProvisioningLock();
      const fields = resolveHostedSignupFields({
        email,
        handle,
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
        billingLane: billingLane === "byok" ? "byok" : "standard",
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

    const pending = loadPendingHostedAuth();
    const planLane: "standard" | "byok" =
      pending?.billingLane === "byok"
        ? "byok"
        : pending?.billingLane === "standard"
          ? "standard"
          : billingLane === "byok"
            ? "byok"
            : "standard";
    const planReadinessSkuId = pending?.readinessSkuId ?? readinessSkuId;
    const planModelTierId = pending?.modelTierId ?? modelTierId;
    const planTopUpPence = pending?.topUpPence ?? topUpPence;

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
        billingLane: planLane,
      });
      if (!fields) {
        throw new Error("Signup details missing — go back to Profile and try again.");
      }

      advanceTask("auth", "agent");
      const selection = (() => {
        try {
          return currentAccountSelection();
        } catch {
          if (pending?.accountTypes?.length) {
            return AccountTypeSelection.fromAccountTypes(pending.accountTypes);
          }
          if (pending?.accountType) {
            return AccountTypeSelection.fromAccountTypes([pending.accountType]);
          }
          throw new Error("Account type missing — go back and try again.");
        }
      })();
      const accountType = selection.primaryAccountType();
      const accountTypes = selection.toAccountTypes();
      await bootstrapHostedAccount({
        handle: bareOwnerHandle(fields.handle),
        accountType,
        accountTypes,
        llmApiKey: fields.llmApiKey,
        llmProvider: fields.llmProvider,
        llmBaseUrl: fields.llmBaseUrl,
        llmModel: fields.llmModel,
        billingLane: fields.billingLane,
        readinessSkuId: planReadinessSkuId,
        modelTierId: planLane === "standard" ? planModelTierId : undefined,
      });
      advanceTask("agent", "connect");
      const connection = await fetchHostedAgentConnection();
      await completeAgentSetup({
        adminUrl: connection.adminUrl,
        adminToken: connection.adminToken,
        sessionToken: connection.sessionToken,
        handle: connection.handle ?? bareOwnerHandle(fields.handle),
        kind: "hosted",
        skipConnectionProbe: true,
      });
      saveAccountType(accountType, accountTypes);
      updateTask("connect", "done");
      clearPendingHostedAuth();
      clearSignupAtProvision();
      navigateAfterAuthSuccess();
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        try {
          const selection = (() => {
            try {
              return currentAccountSelection();
            } catch {
              if (pending?.accountTypes?.length) {
                return AccountTypeSelection.fromAccountTypes(pending.accountTypes);
              }
              if (pending?.accountType) {
                return AccountTypeSelection.fromAccountTypes([pending.accountType]);
              }
              throw new Error("Account type missing — go back and try again.");
            }
          })();
          savePendingHostedAuth({
            kind: "register",
            email: (pending?.email ?? email).trim(),
            handle: pending?.handle ?? handle,
            accountType: selection.primaryAccountType(),
            accountTypes: selection.toAccountTypes(),
            llmApiKey: pending?.llmApiKey ?? llmConnection.apiKey,
            llmProvider: pending?.llmProvider ?? llmConnection.providerId,
            llmBaseUrl: pending?.llmBaseUrl ?? llmConnection.baseUrl,
            llmModel: pending?.llmModel ?? llmConnection.model,
            billingLane: planLane,
            readinessSkuId: planReadinessSkuId,
            modelTierId: planLane === "standard" ? planModelTierId : undefined,
            topUpPence: planTopUpPence,
          });
          markSignupAtProvision();
          setProvisionTasks([
            { id: "auth", label: "Creating account", state: "done" },
            { id: "agent", label: "Redirecting to payment…", state: "active" },
            { id: "connect", label: "Connecting shell", state: "pending" },
          ]);
          const origin = window.location.origin;
          const { checkoutUrl } = await startHostedPlanCheckout({
            lane: planLane,
            readinessSkuId: planReadinessSkuId,
            topUpPence: planTopUpPence > 0 ? planTopUpPence : undefined,
            successUrl: `${origin}/app/?billing=plan-success&auth=register`,
            cancelUrl: `${origin}/app/?billing=plan-cancel&auth=register`,
          });
          try {
            if (window.top) {
              window.top.location.href = checkoutUrl;
              return;
            }
          } catch {
            /* cross-origin top — fall through */
          }
          window.location.href = checkoutUrl;
          return;
        } catch (checkoutErr) {
          const raw =
            checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr);
          setError(friendlyHostedProvisionError(raw));
          setProvisionTasks((prev) =>
            prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
          );
        }
        return;
      }
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
        sessionToken: connection.sessionToken,
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
      navigateAfterAuthSuccess();
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
      let selection: AccountTypeSelection;
      try {
        selection = currentAccountSelection();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      setBusy(true);
      setError(null);
      savePendingHostedAuth({
        kind: "register",
        email: email.trim(),
        handle,
        accountType: selection.primaryAccountType(),
        accountTypes: selection.toAccountTypes(),
        llmApiKey: llmConnection.apiKey,
        llmProvider: llmConnection.providerId,
        llmBaseUrl: llmConnection.baseUrl,
        llmModel: llmConnection.model,
        billingLane: billingLane === "byok" ? "byok" : billingLane === "standard" ? "standard" : "self_hosted",
        readinessSkuId,
        modelTierId: billingLane === "standard" ? modelTierId : undefined,
        topUpPence,
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
        sessionToken: connection.sessionToken,
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
              const raw = err instanceof Error ? err.message : String(err);
              setBusy(false);
              setProvisionTasks([]);
              goTo("credentials");
              setError(friendlyHostedProvisionError(raw));
              return;
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
        if (mode === "register") {
          const selection = currentAccountSelection();
          saveAccountType(selection.primaryAccountType(), selection.toAccountTypes());
        }
        updateTask("connect", "done");
      }

      clearPendingHostedAuth();
      clearSignupAtProvision();
      navigateAfterAuthSuccess();
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
      if (billingLane === "byok") {
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
      try {
        currentAccountSelection();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
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
              Personal or Developer (pick one). Add Business if you also want a brand agent.
            </p>
            <div className="auth-radio-stack">
              <label className={`atom-radio-card${personal ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  name="accountPersona"
                  checked={personal}
                  onChange={(e) => togglePersonal(e.target.checked)}
                />
                <span>
                  <strong>Personal</strong>
                  <span>Everyday use — chat, messages, rooms, and connectors (including MCP tools)</span>
                </span>
              </label>
              <label className={`atom-radio-card${developer ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  name="accountPersona"
                  checked={developer}
                  onChange={(e) => toggleDeveloper(e.target.checked)}
                />
                <span>
                  <strong>Developer</strong>
                  <span>Build modules, connectors, and MCP tool servers</span>
                </span>
              </label>
              <label className={`atom-radio-card${business ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  name="accountBusiness"
                  checked={business}
                  onChange={(e) => setBusiness(e.target.checked)}
                />
                <span>
                  <strong>Business</strong>
                  <span>Optional — brand, catalog, and business agent</span>
                </span>
              </label>
            </div>
          </>
        );
      case "hosting":
        return (
          <>
            <h3 className="auth-slide-title">Choose your plan</h3>
            <p className="auth-slide-desc">
              Standard includes Atom Credits. BYOK is hosting only with your LLM key. Self-hosted is
              free — optional top-ups for Agent Spend.
            </p>
            <div className="auth-radio-stack">
              <label className={`atom-radio-card${billingLane === "standard" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="billingLane"
                  checked={billingLane === "standard"}
                  onChange={() => selectBillingLane("standard")}
                  disabled={!isHostedSignupAvailable()}
                />
                <span>
                  <strong>Standard</strong>
                  <span>
                    {remoteCatalog?.lanes.standard.displayFrom ?? "Hosted"} — agent + credits for
                    chat, speech, and Agent Spend
                  </span>
                </span>
              </label>
              <label className={`atom-radio-card${billingLane === "byok" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="billingLane"
                  checked={billingLane === "byok"}
                  onChange={() => selectBillingLane("byok")}
                  disabled={!isHostedSignupAvailable()}
                />
                <span>
                  <strong>BYOK</strong>
                  <span>
                    {remoteCatalog?.lanes.byok.displayFrom ?? "Hosted"} — you bring your LLM key;
                    top-ups for speech &amp; Agent Spend
                  </span>
                </span>
              </label>
              <label
                className={`atom-radio-card${billingLane === "self_hosted" ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="billingLane"
                  checked={billingLane === "self_hosted"}
                  onChange={() => selectBillingLane("self_hosted")}
                />
                <span>
                  <strong>Self-hosted</strong>
                  <span>Free — run your own agent; optional top-ups for Agent Spend with Atom</span>
                </span>
              </label>
            </div>

            {billingLane === "standard" || billingLane === "byok" ? (
              <>
                <h4 className="auth-slide-subtitle">Readiness</h4>
                <div className="auth-radio-stack">
                  {(billingLane === "standard" ? standardReadiness : byokReadiness).map((sku) => (
                    <label
                      key={sku.id}
                      className={`atom-radio-card${readinessSkuId === sku.id ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="readiness"
                        checked={readinessSkuId === sku.id}
                        onChange={() => setReadinessSkuId(sku.id)}
                      />
                      <span>
                        <strong>
                          {sku.displayName} · {sku.displayPrice}
                        </strong>
                        <span>{sku.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            {billingLane === "standard" ? (
              <>
                <h4 className="auth-slide-subtitle">Agent level</h4>
                <div className="auth-radio-stack">
                  {MODEL_TIER_OPTIONS.map((tier) => (
                    <label
                      key={tier.id}
                      className={`atom-radio-card${modelTierId === tier.id ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="modelTier"
                        checked={modelTierId === tier.id}
                        onChange={() => setModelTierId(tier.id)}
                      />
                      <span>
                        <strong>{tier.label}</strong>
                        <span>{tier.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            <h4 className="auth-slide-subtitle">Optional top-up</h4>
            <p className="atom-note">{topUpHint(billingLane)}</p>
            <div className="auth-radio-stack">
              {topUpOptions.map((pence) => (
                <label
                  key={pence}
                  className={`atom-radio-card${topUpPence === pence ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="topUp"
                    checked={topUpPence === pence}
                    onChange={() => setTopUpPence(pence)}
                  />
                  <span>
                    <strong>{pence === 0 ? "No top-up now" : `£${(pence / 100).toFixed(0)}`}</strong>
                  </span>
                </label>
              ))}
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
                  ? billingLane === "standard"
                    ? "Your public handle. Chat models are included — no API key needed."
                    : "Your public handle and LLM provider key."
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

            {mode === "register" && hosting === "hosted" && billingLane === "standard" ? (
              <p className="atom-note">
                Standard uses Atom’s included models (Efficient / Balanced / Maximum). You can change
                the level later in Settings. BYOK keys are not available on this plan.
              </p>
            ) : mode === "register" && hosting === "hosted" && billingLane === "byok" ? (
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
    <div
      className={`chrome-overlay auth-modal-overlay atom-auth-modal${embedded ? " auth-embed" : ""}`}
      role="dialog"
      aria-modal="true"
    >
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
                    // Re-enter credentials — don't retry agent connect without a session.
                    goTo("credentials");
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
