import { useEffect, useMemo, useRef, useState } from "react";
import {
  bootstrapHostedAccount,
  clearStaleSupabaseSession,
  fetchHostedAgentConnection,
  fetchHostedAccountStatus,
  friendlyHostedProvisionError,
  getSupabaseClient,
  hasSupabaseSession,
  fetchSupabaseSessionEmail,
  isSupabaseEmailConfirmed,
  isEmailNotConfirmedError,
  isEmailRateLimitError,
  registerSupabaseAccount,
  resendSignupConfirmation,
  signInSupabaseAccount,
  signOutSupabase,
  signupHostedDevAccount,
  startHostedPlanCheckout,
  startPendingPlanCheckout,
  mintPendingSignup,
  sendPendingSignupOtp,
  verifyPendingSignupOtp,
  claimPendingSignup,
  persistSignupProfileIntent,
  waitForHostedSubscription,
  isHostedSubscriptionProvisionable,
  SubscriptionRequiredError,
  type AtomAccountType,
} from "./hostedAccount.js";
import {
  chooserActionButtonLabel,
  emailsEqualIgnoreCase,
  mayClearLocalSignupState,
  mayDiscardPendingAfterLoginWithSession,
  registerChooserActions,
  registerChooserBody,
  resolveRegisterChooserIdentity,
  shouldBypassChooser,
  shouldRenderRegisterChooser,
  shouldShowRegisterChooser,
  type ChooserAction,
} from "./accountChooser.js";
import { buildHandleCheckUrl, friendlyHandleWriteError } from "./signupHandle.js";
import { saveAccountType } from "../accountType.js";
import { AccountTypeSelection } from "./accountTypeSelection.js";
import {
  assertBusinessHosting,
  businessHostingDefaults,
  clampReadinessForAccount,
  isBusinessAccountType,
} from "./businessHostingPolicy.js";
import { completeAgentSetup } from "./completeSetup.js";
import { loadFirstRunDone, resetFirstRunDone } from "../firstRunStorage.js";
import { AuthStepper } from "./AuthStepper.js";
import { payPitchFor, payPitchLane } from "./payPitch.js";
import {
  authSteps,
  profilePrimaryLabel,
  registerWizardTitle,
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
import { resolveHostedLlmConnection, isHostedLlmProviderId } from "../settings/llmProviderPresets.js";
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
  loadPendingSignupPassword,
  markSignupAtProvision,
  savePendingHostedAuth,
  savePendingSignupPassword,
} from "./pendingHostedAuth.js";
import {
  PASSWORD_REQUIREMENTS_HINT,
  validatePasswordMatch,
  validatePasswordStrength,
} from "./passwordValidation.js";
import {
  BYOK_READINESS,
  STANDARD_READINESS,
  hostingTypeForLane,
  notificationHint,
  notificationLabel,
  parseLaneFromSearch,
  payChangeReadinessOptions,
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
  setAccountKind: (v: AtomAccountType) => void,
): void {
  try {
    const selection =
      pending.accountTypes && pending.accountTypes.length > 0
        ? AccountTypeSelection.fromAccountTypes(pending.accountTypes)
        : pending.accountType
          ? AccountTypeSelection.fromAccountTypes([pending.accountType])
          : null;
    if (!selection) return;
    setAccountKind(selection.primaryAccountType());
  } catch {
    /* Stale multi-type pending from pre-SIGNUP-UX-01 — drop to single primary if possible. */
    const first = pending.accountTypes?.[0] ?? pending.accountType;
    if (first === "user" || first === "developer" || first === "business") {
      setAccountKind(first);
    }
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
  if (pending.readinessSkuId) {
    // Never restore OFB here — Business lock re-applies; Personal/Developer must not keep it.
    setters.setReadinessSkuId(
      pending.readinessSkuId === "open_for_business" ? "on_when_needed" : pending.readinessSkuId,
    );
  }
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
  const [payChangeOpen, setPayChangeOpen] = useState(false);
  const [hosting, setHosting] = useState<HostingType>(() =>
    hostingTypeForLane(initialLane ?? (isHostedSignupAvailable() ? "standard" : "self_hosted")),
  );
  const [loginNeedsConfirm, setLoginNeedsConfirm] = useState(false);
  const [accountKind, setAccountKind] = useState<AtomAccountType>("user");

  const [remoteCatalog, setRemoteCatalog] = useState<RemotePlanCatalog | null>(null);

  function applyBusinessHostingLock() {
    const d = businessHostingDefaults();
    setBillingLane(d.billingLane);
    setReadinessSkuId(d.readinessSkuId);
    setHosting(d.hosting);
  }

  function chooseAccountKind(kind: AtomAccountType) {
    setAccountKind(kind);
    setPayChangeOpen(false);
    if (isBusinessAccountType(kind)) {
      const d = businessHostingDefaults();
      setBillingLane(d.billingLane);
      setReadinessSkuId(d.readinessSkuId);
      setHosting(d.hosting);
    } else {
      setReadinessSkuId("on_when_needed");
    }
  }

  function effectiveReadinessSkuId(): ReadinessSkuId {
    return clampReadinessForAccount(accountKind, readinessSkuId);
  }

  useEffect(() => {
    if (isBusinessAccountType(accountKind)) {
      applyBusinessHostingLock();
    }
  }, [accountKind]);

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
    return AccountTypeSelection.fromAccountTypes([accountKind]);
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

  function selectBillingLane(lane: BillingLane) {
    if (isBusinessAccountType(accountKind) && lane !== "standard") {
      applyBusinessHostingLock();
      return;
    }
    setBillingLane(lane);
    setHosting(hostingTypeForLane(lane));
    setReadinessSkuId(
      isBusinessAccountType(accountKind) ? businessHostingDefaults().readinessSkuId : "on_when_needed",
    );
    setTopUpPence(0);
  }

  const standardReadiness = remoteCatalog
    ? Object.values(remoteCatalog.lanes.standard.skus).map((s) => ({
        id: s.id as ReadinessSkuId,
        displayName: notificationLabel(s.id as ReadinessSkuId),
        displayPrice: s.displayPrice,
        hint: notificationHint(s.id as ReadinessSkuId),
      }))
    : STANDARD_READINESS;
  const byokReadiness = remoteCatalog
    ? Object.values(remoteCatalog.lanes.byok.skus).map((s) => ({
        id: s.id as ReadinessSkuId,
        displayName: notificationLabel(s.id as ReadinessSkuId),
        displayPrice: s.displayPrice,
        hint: notificationHint(s.id as ReadinessSkuId),
      }))
    : BYOK_READINESS;

  const supabaseHostedRegister =
    mode === "register" && hosting === "hosted" && usesSupabaseHostedAuth();
  const supabaseHostedLogin = mode === "login" && usesSupabaseHostedAuth();
  const needsPay =
    mode === "register" &&
    hosting === "hosted" &&
    (billingLane === "standard" || billingLane === "byok" || isBusinessAccountType(accountKind));

  const steps = useMemo(
    () =>
      loginNeedsConfirm && mode === "login"
        ? (["credentials", "confirm-email", "provisioning"] as AuthStepId[])
        : authSteps(mode, {
            supabaseHostedRegister,
            supabaseHostedLogin,
            skipHosting: isBusinessAccountType(accountKind),
            needsPay,
          }),
    [mode, supabaseHostedRegister, supabaseHostedLogin, loginNeedsConfirm, accountKind, needsPay],
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
  const [otpCode, setOtpCode] = useState("");
  const [payOrderPendingId, setPayOrderPendingId] = useState<string | null>(null);
  const confirmHandledRef = useRef(false);
  /** Prevents register interstitial re-fire after Remove/Create this mount. */
  const chooserResolvedRef = useRef(false);
  /** pending = mounting; show = register interstitial; done = normal wizard */
  const [chooserPhase, setChooserPhase] = useState<"pending" | "show" | "done">("pending");
  const [chooserSessionEmail, setChooserSessionEmail] = useState<string | null>(null);
  const [chooserPendingEmail, setChooserPendingEmail] = useState<string | null>(null);
  const [chooserEmailsMatch, setChooserEmailsMatch] = useState(true);
  const [chooserActionList, setChooserActionList] = useState<ChooserAction[]>([]);
  const [chooserBusy, setChooserBusy] = useState(false);

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
    const emailForCheck = email.trim().toLowerCase();
    if (!emailForCheck.includes("@")) {
      setHandleStatus("Enter your email before choosing a username.");
      return;
    }
    // Clear stale “available” immediately when handle or email changes (diff F-1).
    setHandleStatus("Checking username…");
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const url = buildHandleCheckUrl({
            controlPlaneBase: CONTROL_PLANE_URL,
            handle: normalizeOwnerHandle(handle),
            email: emailForCheck,
          });
          const headers: Record<string, string> = { Accept: "application/json" };
          try {
            const { data } = await getSupabaseClient().auth.getSession();
            const token = data.session?.access_token;
            if (token) headers.Authorization = `Bearer ${token}`;
          } catch {
            /* pre-session Profile step */
          }
          const resp = await fetch(url, { headers });
          const data = (await resp.json()) as {
            available?: boolean;
            handle?: string;
            error?: string;
            code?: string;
          };
          if (cancelled) return;
          if (data.available) {
            setHandleStatus(`${data.handle ?? normalizeOwnerHandle(handle)} is available`);
          } else {
            setHandleStatus(data.error ?? "That username is already taken");
          }
        } catch {
          if (!cancelled) {
            setHandleStatus("Couldn’t check that username right now — try again in a moment.");
          }
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, hosting, email]);

  useEffect(() => {
    if (!usesSupabaseHostedAuth()) {
      setChooserPhase("done");
      return;
    }

    let cancelled = false;
    // Reset resolution when switching Login ↔ Register.
    chooserResolvedRef.current = false;
    setChooserPhase("pending");

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const resumeSetup = params.get("resume") === "1";
      const billing = params.get("billing");
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const isReload = nav?.type === "reload";
      const reloadMidSetup = isReload && isSignupAtProvision();
      const hasSession = await hasSupabaseSession();
      if (cancelled) return;
      const pending = loadPendingHostedAuth();

      const restorePending = (p: NonNullable<typeof pending>) => {
        setEmail(p.email);
        if (p.handle) setHandle(p.handle);
        applyPendingAccountTypes(p, setAccountKind);
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
              p.llmProvider && isHostedLlmProviderId(p.llmProvider)
                ? p.llmProvider
                : prev.providerId,
            baseUrl: p.llmBaseUrl ?? prev.baseUrl,
            model: p.llmModel ?? prev.model,
          }));
        }
        if (p.kind === "register") setHosting("hosted");
      };

      if (billing === "plan-cancel" && (mode === "register" || mode === "login")) {
        if (pending) restorePending(pending);
        setHosting("hosted");
        setChooserPhase("done");
        goTo("pay");
        setError("Payment cancelled — nothing was charged. Continue when you’re ready.");
        return;
      }

      if (billing === "plan-success" && mode === "register" && pending) {
        restorePending(pending);
        if (pending.pendingSignupId) setPayOrderPendingId(pending.pendingSignupId);
        setHosting("hosted");
        setChooserPhase("done");
        void (async () => {
          setBusy(true);
          setError(null);
          goTo("pay");
          setProvisionTasks([
            { id: "auth", label: "Creating your account", state: "active" },
            { id: "agent", label: "Confirming payment…", state: "pending" },
            { id: "connect", label: "Opening Atom", state: "pending" },
          ]);
          try {
            const sessionId = params.get("session_id")?.trim() ?? "";
            if (pending.pendingSignupId && sessionId) {
              const pwd = loadPendingSignupPassword() ?? password;
              if (!pwd || pwd.length < 8) {
                setError("Enter the password you chose, then continue — payment is confirmed.");
                setBusy(false);
                goTo("credentials");
                return;
              }
              await claimPendingSignup({
                pendingSignupId: pending.pendingSignupId,
                email: pending.email,
                password: pwd,
                checkoutSessionId: sessionId,
                handle: pending.handle,
              });
              await signInSupabaseAccount(pending.email, pwd);
              setProvisionTasks([
                { id: "auth", label: "Creating your account", state: "done" },
                { id: "agent", label: "Confirming payment…", state: "active" },
                { id: "connect", label: "Opening Atom", state: "pending" },
              ]);
            } else if (!hasSession) {
              setError("Sign in to finish setup after payment.");
              setBusy(false);
              goTo("credentials");
              return;
            }
            const ok = await waitForHostedSubscription();
            if (!ok) {
              setError("We’re still confirming payment. Wait a moment, then try again.");
              setProvisionTasks((prev) =>
                prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
              );
              setBusy(false);
              goTo("pay");
              return;
            }
            setBusy(false);
            goTo("provisioning");
            await runHostedSupabaseProvisioning();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
            goTo("pay");
          }
        })();
        return;
      }

      const bypass = shouldBypassChooser({
        billing,
        resumeSetup,
        reloadMidSetup,
      });

      // SIGNUP-CHOOSER-02: register-only interstitial. Login never shows it.
      if (
        shouldShowRegisterChooser({
          mode,
          bypass,
          hasSession,
          hasPending: Boolean(pending),
          chooserResolved: chooserResolvedRef.current,
        })
      ) {
        if (cancelled || mode !== "register") return;
        const sessionEmail = hasSession ? await fetchSupabaseSessionEmail() : null;
        if (cancelled || mode !== "register") return;
        const identity = resolveRegisterChooserIdentity({
          sessionEmail,
          pendingEmail: pending?.email ?? null,
        });
        setChooserSessionEmail(identity.sessionEmail);
        setChooserPendingEmail(identity.pendingEmail);
        setChooserEmailsMatch(identity.emailsMatch);
        setChooserActionList(
          registerChooserActions({
            hasSession,
            sessionEmail: identity.sessionEmail,
            pendingKind: pending?.kind ?? null,
            pendingEmail: identity.pendingEmail,
          }),
        );
        // Final cancel/mode check — stale register async must not paint after Login switch.
        if (cancelled || mode !== "register") return;
        setChooserPhase("show");
        return;
      }

      if (cancelled) return;
      setChooserPhase("done");

      if (!resumeSetup && !reloadMidSetup) {
        if (!hasSession && mode === "login") {
          // Login: do not clear register pending just because login opened without session.
          confirmHandledRef.current = false;
        } else if (!hasSession && mode === "register" && !pending) {
          clearPendingHostedAuth();
          clearSignupAtProvision();
          confirmHandledRef.current = false;
        }
        return;
      }

      if (!pending) return;

      restorePending(pending);

      if (hasSession) {
        if (resumeSetup) {
          window.setTimeout(() => {
            void (async () => {
              if (!(await ensureHostedPaidOrGoToPay())) return;
              goTo("provisioning");
              if (pending.kind === "login") {
                await finishHostedSupabaseLogin();
              } else {
                await resumeHostedSupabaseSetup();
              }
            })();
          }, 800);
        } else if (reloadMidSetup) {
          void (async () => {
            if (!(await ensureHostedPaidOrGoToPay())) return;
            goTo("provisioning");
            if (pending.kind === "login") {
              void finishHostedSupabaseLogin();
            } else {
              void resumeHostedSupabaseSetup();
            }
          })();
        }
      } else if (pending.kind === "register") {
        goTo("confirm-email");
      } else {
        setLoginNeedsConfirm(true);
        goTo("confirm-email");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (hosting !== "self-hosted") return;
    const pending = loadPendingHostedAuth();
    if (!pending?.pendingSignupId) return;
    const { pendingSignupId: _drop, emailVerifiedForPay: _v, ...rest } = pending;
    savePendingHostedAuth(rest);
    setPayOrderPendingId(null);
    setOtpCode("");
  }, [hosting]);

  useEffect(() => {
    if (hosting !== "self-hosted" || !SHOW_DEV_WORKFLOWS) return;
    void probeLocalDevAgentBase().then((url) => {
      if (url) setAdminUrl(url);
    });
  }, [hosting]);

  useEffect(() => {
    if (step !== "confirm-email" || !usesSupabaseHostedAuth()) return;
    // Paid path uses OTP on pending — not Supabase magic-link confirmation.
    if (needsPay || payOrderPendingId || loadPendingHostedAuth()?.pendingSignupId) return;

    let cancelled = false;

    const continueAfterConfirm = async () => {
      if (cancelled || confirmHandledRef.current || !(await hasSupabaseSession())) return;
      confirmHandledRef.current = true;
      claimEmailConfirmation();
      setEmailConfirmedThanks(true);
      setError(null);
      window.setTimeout(() => {
        void (async () => {
          if (cancelled) return;
          if (mode === "login") {
            if (!(await ensureHostedPaidOrGoToPay())) return;
            goTo("provisioning");
            void finishHostedSupabaseLogin();
            return;
          }
          const pending = loadPendingHostedAuth();
          const lane = pending?.billingLane;
          if (lane === "self_hosted") {
            goTo("provisioning");
            void runHostedSupabaseProvisioning();
            return;
          }
          if (await isHostedSubscriptionProvisionable()) {
            goTo("provisioning");
            void runHostedSupabaseProvisioning();
            return;
          }
          resetFirstRunDone();
          goTo("pay");
        })();
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
  }, [step, mode, billingLane, accountKind, hosting]);

  function applyPendingFromStorage(): ReturnType<typeof loadPendingHostedAuth> {
    const pending = loadPendingHostedAuth();
    if (!pending) return null;
    setEmail(pending.email);
    if (pending.handle) setHandle(pending.handle);
    applyPendingAccountTypes(pending, setAccountKind);
    applyPendingPlanFields(pending, {
      setBillingLane,
      setReadinessSkuId,
      setModelTierId,
      setTopUpPence,
      setHosting,
    });
    if (pending.llmApiKey) {
      setLlmConnection((prev) => ({
        ...prev,
        apiKey: pending.llmApiKey ?? prev.apiKey,
        providerId:
          pending.llmProvider && isHostedLlmProviderId(pending.llmProvider)
            ? pending.llmProvider
            : prev.providerId,
        baseUrl: pending.llmBaseUrl ?? prev.baseUrl,
        model: pending.llmModel ?? prev.model,
      }));
    }
    if (pending.kind === "register" && pending.billingLane !== "self_hosted") {
      setHosting("hosted");
    }
    return pending;
  }

  async function discardConflictingPendingForSession(sessionEmail: string): Promise<void> {
    const pending = loadPendingHostedAuth();
    if (!pending?.email) return;
    if (!emailsEqualIgnoreCase(pending.email, sessionEmail)) {
      clearPendingHostedAuth();
    }
  }

  async function handleChooserAction(actionId: ChooserAction["id"]): Promise<void> {
    setChooserBusy(true);
    setError(null);
    try {
      if (actionId === "remove_registration") {
        clearPendingHostedAuth();
        clearSignupAtProvision();
        chooserResolvedRef.current = true;
        setChooserPhase("done");
        goTo("account-type");
        return;
      }

      if (actionId === "create_new_account") {
        let signOutSucceeded = true;
        if (await hasSupabaseSession()) {
          try {
            await signOutSupabase();
          } catch (err) {
            signOutSucceeded = false;
            setError(err instanceof Error ? err.message : String(err));
            return;
          }
        }
        const sessionGone = !(await hasSupabaseSession());
        if (
          !mayClearLocalSignupState({
            signOutSucceeded,
            sessionGone,
          })
        ) {
          setError("Could not sign out of the current account. Try again.");
          return;
        }
        clearPendingHostedAuth();
        clearSignupAtProvision();
        resetFirstRunDone();
        confirmHandledRef.current = false;
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setHandle("");
        chooserResolvedRef.current = true;
        setChooserPhase("done");
        goTo("account-type");
        return;
      }

      if (actionId === "continue_registration") {
        const pending = loadPendingHostedAuth();
        const pendingEmail = pending?.email?.trim() ?? "";
        const sessionEmail = (await fetchSupabaseSessionEmail()) ?? "";
        if (
          sessionEmail &&
          pendingEmail &&
          !emailsEqualIgnoreCase(sessionEmail, pendingEmail)
        ) {
          try {
            await signOutSupabase();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return;
          }
          if (await hasSupabaseSession()) {
            setError("Could not sign out of the current account. Try again.");
            return;
          }
        }
        applyPendingFromStorage();
        chooserResolvedRef.current = true;
        setChooserPhase("done");
        const pendingAfter = loadPendingHostedAuth();
        if (pendingAfter?.billingLane === "self_hosted") {
          setHosting("self-hosted");
          if (await hasSupabaseSession()) {
            goTo("provisioning");
            void runHostedSupabaseProvisioning();
          } else {
            goTo("credentials");
          }
          return;
        }
        if (await hasSupabaseSession()) {
          if (!(await isSupabaseEmailConfirmed())) {
            goTo("confirm-email");
            return;
          }
          if (await isHostedSubscriptionProvisionable()) {
            goTo("provisioning");
            void runHostedSupabaseProvisioning();
            return;
          }
          goTo("pay");
          return;
        }
        goTo("credentials");
        return;
      }

      if (actionId === "login_with_session") {
        // Confirm live session before discarding any conflicting pending draft.
        const hasLiveSession = await hasSupabaseSession();
        const sessionEmail = hasLiveSession
          ? ((await fetchSupabaseSessionEmail()) ?? "")
          : "";
        if (
          !mayDiscardPendingAfterLoginWithSession({
            hasLiveSession,
            sessionEmail,
          })
        ) {
          setError("Session expired. Create a new account or try Log in.");
          return;
        }
        await discardConflictingPendingForSession(sessionEmail);
        chooserResolvedRef.current = true;
        setChooserPhase("done");
        setHosting("hosted");

        if (!(await isSupabaseEmailConfirmed())) {
          goTo("confirm-email");
          return;
        }

        if (await isHostedSubscriptionProvisionable()) {
          if (!loadFirstRunDone()) {
            goTo("provisioning");
            void finishHostedSupabaseLogin();
          } else {
            navigateAfterAuthSuccess();
          }
          return;
        }

        resetFirstRunDone();
        goTo("pay");
      }
    } finally {
      setChooserBusy(false);
    }
  }

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
        { id: "agent", label: "Checking your connection", state: "active" },
        { id: "connect", label: "Opening Atom", state: "pending" },
      ];
    }
    if (mode === "login") {
      return [{ id: "connect", label: "Signing you in", state: "active" }];
    }
    return [
      { id: "auth", label: "Creating your account", state: "active" },
      { id: "agent", label: "Getting things ready", state: "pending" },
      { id: "connect", label: "Opening Atom", state: "pending" },
    ];
  }

  function updateTask(id: string, state: ProvisionTask["state"]) {
    setProvisionTasks((prev) => prev.map((t) => (t.id === id ? { ...t, state } : t)));
  }

  function advanceTask(doneId: string, nextId?: string) {
    updateTask(doneId, "done");
    if (nextId) updateTask(nextId, "active");
  }

  function hostedRegisterNeedsPay(): boolean {
    return (
      mode === "register" &&
      hosting === "hosted" &&
      (billingLane === "standard" ||
        billingLane === "byok" ||
        isBusinessAccountType(accountKind))
    );
  }

  /**
   * Block Setup until Stripe-backed entitlement exists.
   * Called only from hosted Supabase setup/login paths — always require provisionable.
   */
  async function ensureHostedPaidOrGoToPay(): Promise<boolean> {
    if (!usesSupabaseHostedAuth()) return true;
    if (await isHostedSubscriptionProvisionable()) return true;
    resetFirstRunDone();
    setError("Complete payment to continue setup.");
    if (mode === "login") {
      // Login stepper has no Pay — recover via register wizard.
      window.location.replace("/app/?auth=register");
      return false;
    }
    goTo("pay");
    return false;
  }

  async function resumeHostedSupabaseSetup(): Promise<void> {
    if (!(await ensureHostedPaidOrGoToPay())) {
      setBusy(false);
      return;
    }
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already running. Wait a moment, then try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks([
      { id: "auth", label: "Creating your account", state: "done" },
      { id: "agent", label: "Getting things ready", state: "done" },
      { id: "connect", label: "Opening Atom", state: "active" },
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
    if (!(await ensureHostedPaidOrGoToPay())) return;
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already running. Wait a moment, then try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks(initProvisionTasks());

    const pending = loadPendingHostedAuth();
    const pendingAccountType =
      pending?.accountType ??
      (pending?.accountTypes?.[0] as AtomAccountType | undefined) ??
      accountKind;
    const businessLocked = isBusinessAccountType(pendingAccountType);
    const planLane: "standard" | "byok" = businessLocked
      ? "standard"
      : pending?.billingLane === "byok"
        ? "byok"
        : pending?.billingLane === "standard"
          ? "standard"
          : billingLane === "byok"
            ? "byok"
            : "standard";
    const planReadinessSkuId = businessLocked
      ? businessHostingDefaults().readinessSkuId
      : clampReadinessForAccount(
          pendingAccountType === "developer" ? "developer" : "user",
          pending?.readinessSkuId ?? readinessSkuId,
        );
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
        // Do not open a second Checkout (webhook lag). Send user to Pay / poll.
        setError("Complete payment to continue.");
        setProvisionTasks((prev) =>
          prev.map((t) => (t.state === "active" ? { ...t, state: "error" } : t)),
        );
        goTo("pay");
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
    if (!(await ensureHostedPaidOrGoToPay())) return;
    if (!tryAcquireProvisioningLock()) {
      setError("Setup is already running. Wait a moment, then try again.");
      return;
    }

    setBusy(true);
    setError(null);
    setProvisionTasks([{ id: "connect", label: "Signing you in", state: "active" }]);

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
      const hostingErr = assertBusinessHosting({
        accountType: selection.primaryAccountType(),
        billingLane,
        readinessSkuId: clampReadinessForAccount(selection.primaryAccountType(), readinessSkuId),
      });
      if (hostingErr) {
        setError(hostingErr);
        applyBusinessHostingLock();
        setBusy(false);
        return;
      }
      const locked = isBusinessAccountType(selection.primaryAccountType());
      const pendingLane = locked
        ? "standard"
        : billingLane === "byok"
          ? "byok"
          : billingLane === "standard"
            ? "standard"
            : "self_hosted";
      const pendingReadiness = locked
        ? businessHostingDefaults().readinessSkuId
        : clampReadinessForAccount(selection.primaryAccountType(), readinessSkuId);
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
        billingLane: pendingLane,
        readinessSkuId: pendingReadiness,
        modelTierId: pendingLane === "standard" ? modelTierId : undefined,
        topUpPence,
      });
      try {
        // SIGNUP-PAY-ORDER-01: paid lanes mint pending + OTP — no auth.users until claim.
        if (pendingLane === "standard" || pendingLane === "byok") {
          if (password) savePendingSignupPassword(password);
          if (await hasSupabaseSession()) {
            await signOutSupabase();
          }
          const minted = await mintPendingSignup({
            email: email.trim(),
            accountType: selection.primaryAccountType(),
            lane: pendingLane,
            readinessSkuId: pendingReadiness,
            handle,
          });
          setPayOrderPendingId(minted.pendingSignupId);
          savePendingHostedAuth({
            kind: "register",
            email: minted.email,
            handle,
            accountType: selection.primaryAccountType(),
            accountTypes: selection.toAccountTypes(),
            llmApiKey: llmConnection.apiKey,
            llmProvider: llmConnection.providerId,
            llmBaseUrl: llmConnection.baseUrl,
            llmModel: llmConnection.model,
            billingLane: pendingLane,
            readinessSkuId: pendingReadiness,
            modelTierId: pendingLane === "standard" ? modelTierId : undefined,
            topUpPence,
            pendingSignupId: minted.pendingSignupId,
          });
          const sent = await sendPendingSignupOtp({
            pendingSignupId: minted.pendingSignupId,
            email: minted.email,
          });
          setEmailConfirmedThanks(false);
          setOtpCode("");
          goTo("confirm-email");
          setResendNote(
            sent.devOtp
              ? `Dev OTP: ${sent.devOtp}`
              : "Enter the code we emailed you.",
          );
          return;
        }

        if (await hasSupabaseSession()) {
          try {
            await persistSignupProfileIntent({
              accountType: selection.primaryAccountType(),
              handle,
            });
          } catch (err) {
            setError(
              friendlyHandleWriteError(err instanceof Error ? err.message : String(err)),
            );
            return;
          }
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
          try {
            await persistSignupProfileIntent({
              accountType: selection.primaryAccountType(),
              handle,
            });
          } catch (err) {
            setError(
              friendlyHandleWriteError(err instanceof Error ? err.message : String(err)),
            );
            return;
          }
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
      const pendingId = pending?.pendingSignupId ?? payOrderPendingId;
      if (pendingId && (needsPay || pending?.pendingSignupId)) {
        const sent = await sendPendingSignupOtp({
          pendingSignupId: pendingId,
          email: (pending?.email ?? email).trim(),
        });
        setResendNote(
          sent.devOtp ? `Dev OTP: ${sent.devOtp}` : "Code sent — check your inbox.",
        );
        return;
      }
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

  async function submitPendingOtp(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const pending = loadPendingHostedAuth();
      const pendingId = pending?.pendingSignupId ?? payOrderPendingId;
      if (!pendingId) throw new Error("Registration session expired — start again.");
      await verifyPendingSignupOtp({
        pendingSignupId: pendingId,
        email: (pending?.email ?? email).trim(),
        code: otpCode.trim(),
      });
      savePendingHostedAuth({
        ...(pending ?? {
          kind: "register",
          email: email.trim(),
        }),
        pendingSignupId: pendingId,
        emailVerifiedForPay: true,
        email: (pending?.email ?? email).trim(),
      });
      setEmailConfirmedThanks(true);
      window.setTimeout(() => {
        goTo("pay");
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
          throw new Error("Where Atom is running and your access token are required.");
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
    if (mode === "register") {
      const hostingErr = assertBusinessHosting({
        accountType: accountKind,
        billingLane,
        readinessSkuId: effectiveReadinessSkuId(),
      });
      if (hostingErr) {
        setError(hostingErr);
        return false;
      }
    }
    if (mode === "register" && hosting === "hosted" && !isHostedSignupAvailable()) {
      setError(
        "Online signup is unavailable right now. Choose “Run it yourself”, or try again later.",
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
        setError("Where Atom is running and your access token are required.");
        return false;
      }
      return true;
    }
    if (hosting === "hosted") {
      if (billingLane === "byok") {
        if (!llmConnection.apiKey.trim()) {
          setError("Add your AI key to continue.");
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
              : "Choose a model to continue.",
          );
          return false;
        }
      }
      if (!handleStatus?.includes("is available")) {
        setError(
          !handleStatus || handleStatus === "Checking username…"
            ? "Wait for the username check to finish."
            : handleStatus.includes("Enter your email")
              ? handleStatus
              : handleStatus.includes("Couldn’t check")
                ? handleStatus
                : "Choose a different handle.",
        );
        return false;
      }
    } else if (!adminUrl.trim() || !adminToken.trim()) {
      setError("Where Atom is running and your access token are required.");
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
      if (isBusinessAccountType(accountKind)) {
        applyBusinessHostingLock();
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
        if (needsPay && password) {
          savePendingSignupPassword(password);
        }
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
    if (step === "pay") {
      void submitPayStep();
    }
  }

  async function submitPayStep(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      let selection: AccountTypeSelection;
      try {
        selection = currentAccountSelection();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      const locked = isBusinessAccountType(selection.primaryAccountType());
      const planLane: "standard" | "byok" = locked
        ? "standard"
        : billingLane === "byok"
          ? "byok"
          : "standard";
      const planReadiness = locked
        ? businessHostingDefaults().readinessSkuId
        : clampReadinessForAccount(selection.primaryAccountType(), readinessSkuId);

      // SIGNUP-HANDLE-01: re-check handle vs register email before writing profile / Checkout.
      if (handle.trim() && email.trim().includes("@")) {
        try {
          const url = buildHandleCheckUrl({
            controlPlaneBase: CONTROL_PLANE_URL,
            handle: normalizeOwnerHandle(handle),
            email: email.trim(),
          });
          const headers: Record<string, string> = { Accept: "application/json" };
          try {
            const { data } = await getSupabaseClient().auth.getSession();
            const token = data.session?.access_token;
            if (token) headers.Authorization = `Bearer ${token}`;
          } catch {
            /* ignore */
          }
          const resp = await fetch(url, { headers });
          const data = (await resp.json()) as { available?: boolean; error?: string };
          if (!data.available) {
            setError(data.error ?? "That username is already taken");
            return;
          }
        } catch {
          setError("Couldn’t check that username right now — try again in a moment.");
          return;
        }
      }

      const existingPending = loadPendingHostedAuth();
      const pendingId = existingPending?.pendingSignupId ?? payOrderPendingId;
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
        billingLane: planLane,
        readinessSkuId: planReadiness,
        modelTierId: planLane === "standard" ? modelTierId : undefined,
        topUpPence,
        pendingSignupId: pendingId ?? undefined,
        emailVerifiedForPay: existingPending?.emailVerifiedForPay,
      });
      const origin = window.location.origin;
      const successUrl = `${origin}/app/?billing=plan-success&auth=register`;
      const cancelUrl = `${origin}/app/?billing=plan-cancel&auth=register`;

      // Guest Checkout when pay-before-auth pending exists (no Bearer user yet).
      if (pendingId) {
        const result = await startPendingPlanCheckout({
          pendingSignupId: pendingId,
          email: email.trim(),
          topUpPence: topUpPence > 0 ? topUpPence : undefined,
          successUrl,
          cancelUrl,
        });
        if (result.status === "already_subscribed" || !result.checkoutUrl) {
          setError("Payment already recorded — return from Checkout or claim with session_id.");
          return;
        }
        try {
          if (window.top) {
            window.top.location.href = result.checkoutUrl;
            return;
          }
        } catch {
          /* cross-origin top */
        }
        window.location.href = result.checkoutUrl;
        return;
      }

      // Logged-in plan change / legacy Bearer subscribe.
      try {
        await persistSignupProfileIntent({
          accountType: selection.primaryAccountType(),
          handle,
        });
      } catch (err) {
        setError(
          friendlyHandleWriteError(err instanceof Error ? err.message : String(err)),
        );
        return;
      }
      const result = await startHostedPlanCheckout({
        lane: planLane,
        readinessSkuId: planReadiness,
        topUpPence: topUpPence > 0 ? topUpPence : undefined,
        successUrl,
        cancelUrl,
      });
      if (result.status === "already_subscribed" || !result.checkoutUrl) {
        goTo("provisioning");
        await runHostedSupabaseProvisioning();
        return;
      }
      try {
        if (window.top) {
          window.top.location.href = result.checkoutUrl;
          return;
        }
      } catch {
        /* cross-origin top */
      }
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Stale register mount must never paint the interstitial on Login (diff F-1).
  const showRegisterChooser = shouldRenderRegisterChooser({ mode, chooserPhase });
  const showWizardBody =
    chooserPhase === "done" || (chooserPhase === "show" && mode !== "register");
  const showChooserPending = chooserPhase === "pending" && !showWizardBody;

  const title =
    showRegisterChooser
      ? "Create account"
      : mode === "login"
        ? "Log in"
        : registerWizardTitle({ step, needsPay: hostedRegisterNeedsPay() });

  const payPrimaryLabel = (() => {
    const locked = isBusinessAccountType(accountKind);
    const lane: "standard" | "byok" = locked
      ? "standard"
      : billingLane === "byok"
        ? "byok"
        : "standard";
    const skuId = locked ? businessHostingDefaults().readinessSkuId : effectiveReadinessSkuId();
    const sku =
      remoteCatalog?.lanes[lane]?.skus?.[skuId] ??
      (lane === "standard"
        ? standardReadiness.find((s) => s.id === skuId)
        : byokReadiness.find((s) => s.id === skuId));
    const listPrice = sku?.displayPrice ?? "";
    return listPrice ? `Pay ${listPrice}` : "Pay";
  })();

  function renderStepPanel(stepId: AuthStepId) {
    switch (stepId) {
      case "account-type":
        return (
          <>
            <h3 className="auth-slide-title">What kind of account?</h3>
            <p className="auth-slide-desc">Choose one to continue.</p>
            <div className="auth-radio-stack">
              <label className={`atom-radio-card${accountKind === "user" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="accountKind"
                  checked={accountKind === "user"}
                  onChange={() => chooseAccountKind("user")}
                />
                <span>
                  <strong>Personal</strong>
                  <span>For you — chat, messages, and everyday tools</span>
                </span>
              </label>
              <label className={`atom-radio-card${accountKind === "developer" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="accountKind"
                  checked={accountKind === "developer"}
                  onChange={() => chooseAccountKind("developer")}
                />
                <span>
                  <strong>Developer</strong>
                  <span>For building and sharing add-ons</span>
                </span>
              </label>
              <label className={`atom-radio-card${accountKind === "business" ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="accountKind"
                  checked={accountKind === "business"}
                  onChange={() => chooseAccountKind("business")}
                />
                <span>
                  <strong>Business</strong>
                  <span>Agent Commerce — shop, brand, and customers</span>
                </span>
              </label>
            </div>
          </>
        );
      case "hosting":
        return (
          <>
            <h3 className="auth-slide-title">Choose a plan</h3>
            <p className="auth-slide-desc">Pick how Atom runs for you. You can change notifications before payment.</p>
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
                    {remoteCatalog?.lanes.standard.displayFrom ?? "From host"} — we run Atom for you,
                    with usage included
                  </span>
                </span>
              </label>
              {!isBusinessAccountType(accountKind) ? (
                <>
                  <label className={`atom-radio-card${billingLane === "byok" ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="billingLane"
                      checked={billingLane === "byok"}
                      onChange={() => selectBillingLane("byok")}
                      disabled={!isHostedSignupAvailable()}
                    />
                    <span>
                      <strong>Bring your own key</strong>
                      <span>
                        {remoteCatalog?.lanes.byok.displayFrom ?? "From host"} — we run Atom; you add
                        your own AI key
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
                      <strong>Run it yourself</strong>
                      <span>Free — you install and run Atom on your own machine</span>
                    </span>
                  </label>
                </>
              ) : null}
            </div>
          </>
        );
      case "credentials":
        return (
          <>
            <h3 className="auth-slide-title">
              {mode === "register" ? "Create your login" : "Welcome back"}
            </h3>
            <p className="auth-slide-desc">
              {mode === "register" && hosting === "self-hosted"
                ? "Email is optional here — you’ll connect your own Atom on the next step."
                : IS_LOCAL_DEV && hosting === "hosted" && !usesSupabaseHostedAuth()
                  ? "Enter an email to continue."
                  : mode === "register"
                    ? "Enter an email and password to continue."
                    : "Enter your email and password to continue."}
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
              {mode === "login" ? "Almost there" : "Choose a username"}
            </h3>
            <p className="auth-slide-desc">
              {mode === "login"
                ? ATOM_BROWSER_MODE
                  ? "Confirm your username, then continue."
                  : "Enter your connection details to continue."
                : hosting === "hosted"
                  ? billingLane === "standard"
                    ? "Pick a username people will see. Then continue."
                    : "Pick a username, then add your AI key to continue."
                  : ATOM_BROWSER_MODE
                    ? "Pick a username to continue."
                    : "Pick a username and enter where Atom is running."}
            </p>
            <label className="atom-field">
              <span className="atom-field-label">Username</span>
              <input
                value={handle}
                onChange={(e) => setHandle(normalizeOwnerHandle(e.target.value))}
                placeholder="@you"
              />
            </label>
            {handleStatus ? <p className="atom-note">{handleStatus}</p> : null}

            {mode === "register" && hosting === "hosted" && billingLane === "byok" ? (
              <HostedLlmConnectionFields value={llmConnection} onChange={setLlmConnection} />
            ) : mode === "register" && hosting === "hosted" ? null : (
              <>
                <label className="atom-field">
                  <span className="atom-field-label">Where Atom is running</span>
                  <input
                    value={adminUrl}
                    onChange={(e) => setAdminUrl(e.target.value)}
                    placeholder="https://your-agent.example.com"
                    readOnly={ATOM_BROWSER_MODE}
                  />
                </label>
                <label className="atom-field">
                  <span className="atom-field-label">Access token</span>
                  <input
                    type="password"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                    readOnly={ATOM_BROWSER_MODE}
                  />
                </label>
                {ATOM_BROWSER_MODE ? (
                  <p className="atom-note">Connection details are ready. Continue to finish.</p>
                ) : SHOW_DEV_WORKFLOWS ? (
                  <p className="atom-note">
                    Local setup: start Atom, then paste the address and access token.
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
              Email confirmed. Continuing…
            </p>
            <span className="auth-spinner" aria-hidden="true" />
          </>
        ) : needsPay || payOrderPendingId || loadPendingHostedAuth()?.pendingSignupId ? (
          <>
            <h3 className="auth-slide-title">Verify your email</h3>
            <p className="auth-slide-desc">
              Enter the code we sent to <strong>{email}</strong> before paying.
            </p>
            <label className="atom-field">
              <span>Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="8-digit code"
              />
            </label>
            {resendNote ? <p className="atom-note">{resendNote}</p> : null}
          </>
        ) : (
          <>
            <h3 className="auth-slide-title">Check your email</h3>
            <p className="auth-slide-desc">
              We sent a link to <strong>{email}</strong>. Open it to continue — this page will update
              on its own.
            </p>
            <p className="atom-note">You can leave this tab open while you check your inbox.</p>
            {resendNote ? <p className="atom-note">{resendNote}</p> : null}
          </>
        );
      case "pay": {
        const locked = isBusinessAccountType(accountKind);
        const lane = locked ? "standard" : payPitchLane(billingLane);
        const skuId = locked ? businessHostingDefaults().readinessSkuId : effectiveReadinessSkuId();
        const sku =
          remoteCatalog?.lanes[lane]?.skus?.[skuId] ??
          (lane === "standard"
            ? standardReadiness.find((s) => s.id === skuId)
            : byokReadiness.find((s) => s.id === skuId));
        const listPrice = sku?.displayPrice ?? "See plan";
        const pitch = payPitchFor({
          accountType: locked ? "business" : accountKind,
          lane,
          readinessSkuId: skuId,
        });
        const changeOptions =
          !locked && (lane === "standard" || lane === "byok")
            ? payChangeReadinessOptions(lane, remoteCatalog?.lanes[lane]?.skus)
            : [];
        return (
          <>
            <h3 className="auth-slide-title">{pitch.headline}</h3>
            <div className="auth-pay-summary">
              <p className="auth-slide-desc auth-pay-summary-line">
                <strong>{listPrice}</strong>
                {locked ? null : (
                  <>
                    {" "}
                    · Notifications: {notificationLabel(skuId)}
                  </>
                )}
              </p>
              {!locked ? <p className="atom-note">{notificationHint(skuId)}</p> : null}
              <p className="atom-note">
                Daily Actions email included with every plan (you can turn it off later).
              </p>
              {!locked ? (
                <button
                  type="button"
                  className="atom-btn atom-btn-secondary auth-pay-change"
                  onClick={() => setPayChangeOpen((open) => !open)}
                >
                  {payChangeOpen ? "Done" : "Change"}
                </button>
              ) : null}
            </div>
            {payChangeOpen && changeOptions.length > 0 ? (
              <div className="auth-pay-change-panel">
                <h4 className="auth-slide-subtitle">Notifications</h4>
                <div className="auth-radio-stack">
                  {changeOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`atom-radio-card${skuId === option.id ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="payReadiness"
                        checked={skuId === option.id}
                        onChange={() => setReadinessSkuId(option.id)}
                      />
                      <span>
                        <strong>
                          {option.displayName} · {option.displayPrice}
                        </strong>
                        <span>{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="atom-note auth-pay-lead">{pitch.lead}</p>
            <ul className="auth-pay-benefits">
              {pitch.benefits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="atom-note">
              <strong>{listPrice} due today.</strong> {pitch.closing}
            </p>
          </>
        );
      }
      case "provisioning":
        return (
          <>
            <h3 className="auth-slide-title">Setting up</h3>
            <p className="auth-slide-desc">
              {busy ? "This usually takes a few seconds." : "Ready when you are."}
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
          {showChooserPending ? (
            <p className="auth-slide-desc">Checking signed-in account…</p>
          ) : null}

          {showRegisterChooser ? (
            <div className="auth-chooser">
              <h3 className="auth-slide-title">Already started?</h3>
              <p className="auth-slide-desc">
                {registerChooserBody({
                  sessionEmail: chooserSessionEmail,
                  pendingEmail: chooserPendingEmail,
                  emailsMatch: chooserEmailsMatch,
                })}
              </p>
              {error ? <p className="atom-note atom-note-error">{error}</p> : null}
              <div className="auth-actions auth-chooser-actions">
                {chooserActionList.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={
                      action.primary
                        ? "atom-btn atom-btn-primary"
                        : "atom-btn atom-btn-secondary"
                    }
                    disabled={chooserBusy}
                    onClick={() => void handleChooserAction(action.id)}
                  >
                    {chooserActionButtonLabel({ action })}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showWizardBody ? (
            <>
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
                {step === "pay"
                  ? payPrimaryLabel
                  : step === "credentials" && mode === "login"
                    ? "Log in"
                    : step === "profile"
                      ? profilePrimaryLabel({
                          mode,
                          needsPay: hostedRegisterNeedsPay(),
                        })
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
              {needsPay || payOrderPendingId || loadPendingHostedAuth()?.pendingSignupId ? (
                <button
                  type="button"
                  className="atom-btn atom-btn-primary"
                  disabled={busy || otpCode.trim().length < 8}
                  onClick={() => void submitPendingOtp()}
                >
                  Verify code
                </button>
              ) : null}
              <button
                type="button"
                className="atom-btn atom-btn-secondary"
                disabled={busy}
                onClick={() => void resendConfirmationEmail()}
              >
                {needsPay || payOrderPendingId || loadPendingHostedAuth()?.pendingSignupId
                  ? "Resend code"
                  : "Resend email"}
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
