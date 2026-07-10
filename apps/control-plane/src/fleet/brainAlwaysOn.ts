/**
 * Hosted always-on Agent Brain entitlement (D078 / BK-45).
 * Beta: free always-on. Post-beta: require subscription (or explicit grant).
 */
export function resolveHostedBrainAlwaysOn(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { subscribed?: boolean },
): boolean {
  const betaFree = env.ATOM_BETA_FREE !== "0" && env.ATOM_BETA_FREE !== "false";
  if (betaFree) return true;
  return opts?.subscribed === true;
}
