/**
 * Hosted always-on Agent Brain entitlement (D078 / BK-45).
 * Requires an active subscription (or explicit subscribed opt).
 */
export function resolveHostedBrainAlwaysOn(
  _env: NodeJS.ProcessEnv = process.env,
  opts?: { subscribed?: boolean },
): boolean {
  return opts?.subscribed === true;
}
