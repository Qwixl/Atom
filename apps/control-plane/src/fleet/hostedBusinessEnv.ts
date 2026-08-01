/**
 * Env triad Atom-MC / fleet MUST set on hosted Business agents (D139 / BUS-01).
 *
 * v1: env is set only by Atom-MC provision (not owner-editable). Spoofable on
 * self-host by design — self-host MUST NOT receive ATOM_COMMERCE_ELIGIBLE from MC.
 * Cryptographic MC entitlement attestation is deferred to BUS-01-ELIG-01.
 */
export function hostedBusinessCommerceEnv(input: {
  workspaceKind?: "personal" | "business" | "developer";
  commerceEligible?: boolean;
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
  }
  return env;
}
