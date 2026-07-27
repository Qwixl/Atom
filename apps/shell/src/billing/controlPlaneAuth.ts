import { supabaseAccessToken } from "../auth/hostedAccount.js";

/**
 * Headers for owner-scoped Atom-MC billing routes.
 *
 * `/billing/credits/*` and `/billing/subscription/*` require the caller's Supabase
 * JWT and reject any accountId that does not match it. Returns null when there is
 * no session, so callers can skip the request rather than take a 401.
 */
export async function controlPlaneAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string> | null> {
  const token = await supabaseAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, ...extra };
}
