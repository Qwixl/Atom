export type AuthStepId =
  | "account-type"
  | "hosting"
  | "credentials"
  | "profile"
  | "confirm-email"
  | "provisioning";

export type AuthWizardMode = "register" | "login";

export type HostingType = "hosted" | "self-hosted";

export function authSteps(
  mode: AuthWizardMode,
  options?: { supabaseHostedRegister?: boolean; supabaseHostedLogin?: boolean },
): AuthStepId[] {
  if (mode === "login") {
    if (options?.supabaseHostedLogin) return ["credentials", "provisioning"];
    // Self-hosted / local browser mode: reconnect agent (no Supabase credentials).
    return ["profile", "provisioning"];
  }
  const steps: AuthStepId[] = ["account-type", "hosting", "credentials", "profile"];
  if (options?.supabaseHostedRegister) {
    steps.push("confirm-email");
  }
  steps.push("provisioning");
  return steps;
}

export function stepLabel(step: AuthStepId): string {
  switch (step) {
    case "account-type":
      return "Type";
    case "hosting":
      return "Hosting";
    case "credentials":
      return "Account";
    case "profile":
      return "Profile";
    case "confirm-email":
      return "Verify";
    case "provisioning":
      return "Setup";
  }
}

export function stepIndex(steps: AuthStepId[], step: AuthStepId): number {
  return steps.indexOf(step);
}
