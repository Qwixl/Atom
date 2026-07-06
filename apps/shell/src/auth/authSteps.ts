export type AuthStepId = "hosting" | "credentials" | "profile" | "provisioning";

export type AuthWizardMode = "register" | "login";

export type HostingType = "hosted" | "self-hosted";

export function authSteps(mode: AuthWizardMode): AuthStepId[] {
  if (mode === "login") return ["credentials", "provisioning"];
  return ["hosting", "credentials", "profile", "provisioning"];
}

export function stepLabel(step: AuthStepId): string {
  switch (step) {
    case "hosting":
      return "Hosting";
    case "credentials":
      return "Account";
    case "profile":
      return "Profile";
    case "provisioning":
      return "Setup";
  }
}

export function stepIndex(steps: AuthStepId[], step: AuthStepId): number {
  return steps.indexOf(step);
}
