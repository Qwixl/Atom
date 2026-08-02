import type { AuthWizardMode } from "./authSteps.js";

export type ChooserActionId =
  | "complete_signup"
  | "continue_session"
  | "resume_pending"
  | "different_account"
  | "start_over";

export type ChooserAction = {
  id: ChooserActionId;
  label: string;
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

export function shouldShowChooser(opts: {
  bypass: boolean;
  hasSession: boolean;
  hasPending: boolean;
}): boolean {
  if (opts.bypass) return false;
  return opts.hasSession || opts.hasPending;
}

export function emailsEqualIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (!left || !right) return left === right;
  return left === right;
}

/** Session email wins; flag conflict when pending differs. */
export function resolveChooserIdentity(opts: {
  sessionEmail: string | null;
  pendingEmail: string | null;
}): {
  primaryEmail: string;
  conflictEmail: string | null;
  emailsMatch: boolean;
} {
  const session = (opts.sessionEmail ?? "").trim();
  const pending = (opts.pendingEmail ?? "").trim();
  if (session && pending && !emailsEqualIgnoreCase(session, pending)) {
    return {
      primaryEmail: session,
      conflictEmail: pending,
      emailsMatch: false,
    };
  }
  const primary = session || pending || "";
  return { primaryEmail: primary, conflictEmail: null, emailsMatch: true };
}

/**
 * Visible chooser actions from mode × session × pending × provisionable.
 * provisionable null = unknown (treat unpaid-safe for complete/continue labels).
 */
export function chooserActions(opts: {
  mode: AuthWizardMode;
  hasSession: boolean;
  pendingKind: "register" | "login" | null;
  provisionable: boolean | null;
}): ChooserAction[] {
  const unpaid = opts.provisionable !== true;
  const actions: ChooserAction[] = [];

  if (opts.hasSession) {
    if (opts.mode === "register") {
      if (unpaid) {
        actions.push({
          id: "complete_signup",
          label: "Complete signup",
          primary: true,
        });
      } else {
        actions.push({
          id: "continue_session",
          label: "Continue setup",
          primary: true,
        });
      }
    } else {
      // login
      if (unpaid) {
        actions.push({
          id: "complete_signup",
          label: "Finish payment",
          primary: true,
        });
      } else {
        actions.push({
          id: "continue_session",
          label: "Continue",
          primary: true,
        });
      }
    }
    actions.push({ id: "different_account", label: "Use a different account" });
    return actions;
  }

  // Pending only — no session
  if (opts.pendingKind === "register") {
    actions.push({
      id: "resume_pending",
      label: "Resume signup",
      primary: true,
    });
  }
  actions.push({ id: "start_over", label: "Start over", primary: actions.length === 0 });
  return actions;
}

/** Fail-closed: only clear local signup state after sign-out succeeded. */
export function mayClearLocalSignupState(opts: {
  signOutSucceeded: boolean;
  sessionGone: boolean;
}): boolean {
  return opts.signOutSucceeded && opts.sessionGone;
}
