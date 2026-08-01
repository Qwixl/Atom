/**
 * BUS-01 / D139 / BUS-01-ELIG-01 — Atom Business commerce eligibility.
 *
 * Network merchants MUST present a valid Atom-MC signed commerce entitlement.
 * Env triad alone is not sufficient (spoofable on self-host).
 * Buyers (personal/developer workspaces) do not need this — they pay merchants.
 */
import { verifyCommerceEntitlementCert } from "./commerceEntitlementCert.js";

export function readCommerceEntitlementCompact(env: NodeJS.ProcessEnv = process.env): string {
  return env.ATOM_COMMERCE_ENTITLEMENT?.trim() ?? "";
}

export async function isHostedBusinessCommerceEligible(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const compact = readCommerceEntitlementCompact(env);
  if (!compact) return false;
  try {
    await verifyCommerceEntitlementCert(compact, {
      publicKeyB64: env.ATOM_COMMERCE_MC_PUBLIC_KEY_B64?.trim() || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export async function assertHostedBusinessCommerceEligible(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const compact = readCommerceEntitlementCompact(env);
  if (!compact) {
    throw new Error(
      "Atom Business commerce requires ATOM_COMMERCE_ENTITLEMENT (MC-signed). Env triad alone is not eligible.",
    );
  }
  try {
    await verifyCommerceEntitlementCert(compact, {
      publicKeyB64: env.ATOM_COMMERCE_MC_PUBLIC_KEY_B64?.trim() || undefined,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Atom Business commerce entitlement failed: ${error.message}`
        : "Atom Business commerce entitlement failed",
    );
  }
}
