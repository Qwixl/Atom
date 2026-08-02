export type AuthStepId =
  | "account-type"
  | "hosting"
  | "credentials"
  | "profile"
  | "confirm-email"
  | "pay"
  | "provisioning";

export type AuthWizardMode = "register" | "login";

export type HostingType = "hosted" | "self-hosted";

export function authSteps(
  mode: AuthWizardMode,
  options?: {
    supabaseHostedRegister?: boolean;
    supabaseHostedLogin?: boolean;
    /** Business: hosting is fixed (Standard Always-On) — do not show a hosting step. */
    skipHosting?: boolean;
    /** Standard / BYOK hosted: show Pay after verify (or after profile). */
    needsPay?: boolean;
  },
): AuthStepId[] {
  if (mode === "login") {
    if (options?.supabaseHostedLogin) return ["credentials", "provisioning"];
    // Self-hosted / local browser mode: reconnect agent (no Supabase credentials).
    return ["profile", "provisioning"];
  }
  const steps: AuthStepId[] = options?.skipHosting
    ? ["account-type", "credentials", "profile"]
    : ["account-type", "hosting", "credentials", "profile"];
  if (options?.supabaseHostedRegister) {
    steps.push("confirm-email");
  }
  if (options?.needsPay) {
    steps.push("pay");
  }
  steps.push("provisioning");
  return steps;
}

export function stepLabel(step: AuthStepId): string {
  switch (step) {
    case "account-type":
      return "Type";
    case "hosting":
      return "Plan";
    case "credentials":
      return "Account";
    case "profile":
      return "Profile";
    case "confirm-email":
      return "Verify";
    case "pay":
      return "Pay";
    case "provisioning":
      return "Setup";
  }
}

export function stepIndex(steps: AuthStepId[], step: AuthStepId): number {
  return steps.indexOf(step);
}

/** Profile primary button when Pay is still ahead of Setup. */
export function profilePrimaryLabel(opts: {
  mode: AuthWizardMode;
  needsPay: boolean;
}): string {
  if (opts.mode === "login") return "Log in";
  if (opts.needsPay) return "Continue";
  return "Create account";
}

/** Modal title honesty for hosted Pay-ahead signup. */
export function registerWizardTitle(opts: {
  step: AuthStepId;
  needsPay: boolean;
}): string {
  if (
    opts.step === "pay" ||
    opts.step === "confirm-email" ||
    (opts.step === "profile" && opts.needsPay)
  ) {
    return "Finish signup";
  }
  return "Create account";
}
