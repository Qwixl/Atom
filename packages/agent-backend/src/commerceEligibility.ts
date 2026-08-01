/**
 * BUS-01 / D139 — Atom Business commerce eligibility.
 *
 * Network merchants MUST be Atom-hosted Business workspaces.
 * Self-host MAY set ATOM_BUSINESS_MODE for local experiments — that alone
 * MUST NOT pass this check.
 *
 * Control plane sets ATOM_COMMERCE_ELIGIBLE=1 (and typically
 * ATOM_WORKSPACE_KIND=business) at provision for hosted Business agents.
 */
export function isHostedBusinessCommerceEligible(env: NodeJS.ProcessEnv = process.env): boolean {
  const eligible = env.ATOM_COMMERCE_ELIGIBLE?.trim() === "1" || env.ATOM_COMMERCE_ELIGIBLE === "true";
  const kind = env.ATOM_WORKSPACE_KIND?.trim().toLowerCase();
  const hosted =
    env.ATOM_HOSTED?.trim() === "1" ||
    env.ATOM_HOSTED === "true" ||
    env.ATOM_MANAGED_HOSTING?.trim() === "1";
  return eligible && kind === "business" && hosted;
}

export function assertHostedBusinessCommerceEligible(env: NodeJS.ProcessEnv = process.env): void {
  if (!isHostedBusinessCommerceEligible(env)) {
    throw new Error(
      "Atom Business commerce requires a hosted Business workspace (ATOM_COMMERCE_ELIGIBLE + ATOM_WORKSPACE_KIND=business + ATOM_HOSTED). Self-host ATOM_BUSINESS_MODE alone is not eligible.",
    );
  }
}
