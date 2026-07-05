export const DEFAULT_PLATFORM_URL = "https://shell-atom.vercel.app";
export const DEFAULT_CONTROL_PLANE_URL = "https://control.qwixl.dev";

/** Always-on Atom platform (shell, registry, discovery indexes). Production by default. */
export function resolvePlatformUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.ATOM_PLATFORM_URL?.trim() || DEFAULT_PLATFORM_URL).replace(/\/$/, "");
}

/** Managed hosting control plane — provisions hosted owner agents. */
export function resolveControlPlaneUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.ATOM_CONTROL_PLANE_URL?.trim() || DEFAULT_CONTROL_PLANE_URL).replace(/\/$/, "");
}

export function isLocalPlatformUrl(platformUrl: string): boolean {
  try {
    const { hostname } = new URL(platformUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
  } catch {
    return false;
  }
}

export async function probePlatform(platformUrl = resolvePlatformUrl()): Promise<boolean> {
  try {
    const resp = await fetch(`${platformUrl}/registry/index.json`, { method: "HEAD" });
    return resp.ok;
  } catch {
    try {
      const resp = await fetch(platformUrl);
      return resp.ok;
    } catch {
      return false;
    }
  }
}
