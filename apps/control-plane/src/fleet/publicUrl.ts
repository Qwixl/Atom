const LOCALHOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i;

export function isLocalHostAgentUrl(url: string): boolean {
  return LOCALHOST_RE.test(url.trim());
}

/** Enforce HTTPS public agent URLs when provisioning in production. */
export function assertProductionAgentPublicUrl(url: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const trimmed = url.trim();
  if (isLocalHostAgentUrl(trimmed)) {
    throw new Error(
      "Production fleet must not expose localhost agent URLs — set ATOM_FLEET_PUBLIC_URL_TEMPLATE to an HTTPS endpoint.",
    );
  }
  if (!trimmed.startsWith("https://")) {
    throw new Error(
      "Production fleet requires HTTPS agent URLs — set ATOM_FLEET_PUBLIC_URL_TEMPLATE (e.g. https://{port}.agents.example.com).",
    );
  }
}

export function requireProductionFleetTemplate(): void {
  if (process.env.NODE_ENV !== "production") return;
  const template = process.env.ATOM_FLEET_PUBLIC_URL_TEMPLATE?.trim();
  if (!template?.startsWith("https://")) {
    throw new Error(
      "NODE_ENV=production requires ATOM_FLEET_PUBLIC_URL_TEMPLATE with an https:// template.",
    );
  }
}
