import type { AuthWizardMode } from "./authSteps.js";

export type ChooserActionId =
  | "login_with_session"
  | "continue_registration"
  | "remove_registration"
  | "create_new_account";

export type ChooserAction = {
  id: ChooserActionId;
  label: string;
  /** Email shown on the button when set. */
  email?: string;
  primary?: boolean;
};

/** Billing return + email-confirm resume + mid-setup reload skip the chooser. */
export function shouldBypassChooser(opts: {
  billing: string | null;
  resumeSetup: boolean;
  reloadMidSetup: boolean;
}): boolean {
  if (opts.billing === "plan-success" || opts.billing === "plan-cancel") return true;
  if (opts.resumeSetup || opts.reloadMidSetup) return true;
  return false;
}

/**
 * Register-only interstitial (SIGNUP-CHOOSER-02).
 * Login must never show this — mode must be register.
 */
export function shouldShowRegisterChooser(opts: {
  mode: AuthWizardMode;
  bypass: boolean;
  hasSession: boolean;
  hasPending: boolean;
  chooserResolved: boolean;
}): boolean {
  if (opts.mode !== "register") return false;
  if (opts.bypass || opts.chooserResolved) return false;
  return opts.hasSession || opts.hasPending;
}

/** Render gate: stale register mount must not paint chooser on Login. */
export function shouldRenderRegisterChooser(opts: {
  mode: AuthWizardMode;
  chooserPhase: "pending" | "show" | "done";
}): boolean {
  return opts.mode === "register" && opts.chooserPhase === "show";
}

/**
 * login_with_session may clear a conflicting pending draft only after a live
 * session email is confirmed (diff F-2).
 */
export function mayDiscardPendingAfterLoginWithSession(opts: {
  hasLiveSession: boolean;
  sessionEmail: string | null | undefined;
}): boolean {
  return opts.hasLiveSession && Boolean((opts.sessionEmail ?? "").trim());
}

export function emailsEqualIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (!left || !right) return left === right;
  return left === right;
}

export function resolveRegisterChooserIdentity(opts: {
  sessionEmail: string | null;
  pendingEmail: string | null;
}): {
  sessionEmail: string | null;
  pendingEmail: string | null;
  emailsMatch: boolean;
} {
  const session = (opts.sessionEmail ?? "").trim() || null;
  const pending = (opts.pendingEmail ?? "").trim() || null;
  // emailsMatch is true only when both sides are present and equal; otherwise false (not N/A).
  return {
    sessionEmail: session,
    pendingEmail: pending,
    emailsMatch: Boolean(session && pending && emailsEqualIgnoreCase(session, pending)),
  };
}

/**
 * Register interstitial actions — never used for login mode.
 */
export function registerChooserActions(opts: {
  hasSession: boolean;
  sessionEmail: string | null;
  pendingKind: "register" | "login" | null;
  pendingEmail: string | null;
}): ChooserAction[] {
  const actions: ChooserAction[] = [];
  const session = (opts.sessionEmail ?? "").trim() || null;
  const pendingEmail = (opts.pendingEmail ?? "").trim() || null;
  const sameEmail =
    Boolean(session && pendingEmail && emailsEqualIgnoreCase(session, pendingEmail));

  if (opts.hasSession && session) {
    actions.push({
      id: "login_with_session",
      label: "Log in with this account",
      email: session,
      primary: true,
    });
  }

  // Continue registration only for register-kind pending; omit when same email as session
  // (Log in with this account already covers finishing that identity).
  if (opts.pendingKind === "register" && pendingEmail && !sameEmail) {
    actions.push({
      id: "continue_registration",
      label: "Continue this registration",
      email: pendingEmail,
      primary: !opts.hasSession,
    });
  }

  if (opts.pendingKind === "register" || opts.pendingKind === "login") {
    if (pendingEmail || opts.pendingKind) {
      actions.push({
        id: "remove_registration",
        label: pendingEmail
          ? `Remove this registration`
          : "Remove this registration",
        email: pendingEmail ?? undefined,
      });
    }
  }

  actions.push({
    id: "create_new_account",
    label: "Create a new account",
    primary: actions.length === 0,
  });

  return actions;
}

export function chooserActionButtonLabel(opts: {
  action: ChooserAction;
}): string {
  const email = opts.action.email?.trim();
  if (!email) return opts.action.label;
  if (opts.action.id === "login_with_session") {
    return `${opts.action.label} (${email})`;
  }
  if (opts.action.id === "continue_registration" || opts.action.id === "remove_registration") {
    return `${opts.action.label} (${email})`;
  }
  return opts.action.label;
}

export function registerChooserBody(opts: {
  sessionEmail: string | null;
  pendingEmail: string | null;
  emailsMatch: boolean;
}): string {
  const session = opts.sessionEmail?.trim() || null;
  const pending = opts.pendingEmail?.trim() || null;
  if (session && pending && !opts.emailsMatch) {
    return (
      `You’re currently logged in as ${session}. There’s also an unfinished registration ` +
      `for ${pending} on this device. Choose what to do next.`
    );
  }
  if (session) {
    return `You’re currently logged in as ${session}. Log in with this account, or create a new one.`;
  }
  if (pending) {
    return `There’s an unfinished registration for ${pending} on this device.`;
  }
  return "Choose how to continue.";
}

/** Fail-closed: only clear local signup state after sign-out succeeded. */
export function mayClearLocalSignupState(opts: {
  signOutSucceeded: boolean;
  sessionGone: boolean;
}): boolean {
  return opts.signOutSucceeded && opts.sessionGone;
}
