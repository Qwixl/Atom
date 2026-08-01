/**
 * Env triad Atom-MC / fleet MUST set on hosted Business agents (D139 / BUS-01).
 *
 * BUS-01-ELIG-01: also inject ATOM_COMMERCE_ENTITLEMENT (MC-signed compact).
 * Env triad alone is not sufficient for agent eligibility.
 */
export function hostedBusinessCommerceEnv(input: {
  workspaceKind?: "personal" | "business" | "developer";
  commerceEligible?: boolean;
  commerceEntitlement?: string;
}): Record<string, string> {
  const kind = input.workspaceKind ?? "personal";
  const env: Record<string, string> = {
    ATOM_WORKSPACE_KIND: kind,
    ATOM_HOSTED: "1",
  };
  if (kind === "business") {
    env.ATOM_BUSINESS_MODE = "true";
    if (input.commerceEligible !== false) {
      env.ATOM_COMMERCE_ELIGIBLE = "1";
    }
    const compact = input.commerceEntitlement?.trim();
    if (compact) env.ATOM_COMMERCE_ENTITLEMENT = compact;
  }
  return env;
}
