/**
 * Install hand-off parser (D100 / Atom-Apps A004).
 * One parser for `atom://install?...` and `https://…/install?...`.
 */

export type InstallHandoff = {
  moduleId: string;
  version: string;
  /** Compact entitlement certificate; present only for paid modules. */
  cert?: string;
  source?: string;
};

export type InstallHandoffParseError = {
  kind: "error";
  message: string;
};

export type InstallHandoffParseOk = {
  kind: "ok";
  handoff: InstallHandoff;
};

export type InstallHandoffParseResult = InstallHandoffParseOk | InstallHandoffParseError | null;

const PENDING_KEY = "atom-pending-install-handoff";

/** Fired after a hand-off URL is accepted (HTTPS location or native atom://). */
export const INSTALL_HANDOFF_EVENT = "atom-install-handoff";

export type InstallHandoffEventDetail = {
  result: InstallHandoffParseOk | InstallHandoffParseError;
};

/** True when the URL is an install hand-off entry (custom scheme or HTTPS path). */
export function isInstallHandoffUrl(url: URL): boolean {
  const protocol = url.protocol.replace(/:$/, "").toLowerCase();
  if (protocol === "atom") {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/^\//, "").toLowerCase();
    return host === "install" || path === "install";
  }
  if (protocol === "http" || protocol === "https") {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path === "/install" || path === "/app/install";
  }
  return false;
}

/**
 * Parse install query params. Returns null when the location is not an install
 * entry point. Returns `{ kind: "error" }` for install URLs with bad/missing params.
 */
export function parseInstallHandoff(input: string | URL): InstallHandoffParseResult {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    return { kind: "error", message: "Install link is not a valid URL." };
  }

  if (!isInstallHandoffUrl(url)) return null;

  const moduleId = url.searchParams.get("moduleId")?.trim() ?? "";
  const version = url.searchParams.get("version")?.trim() ?? "";
  const cert = url.searchParams.get("cert")?.trim() || undefined;
  const source = url.searchParams.get("source")?.trim() || undefined;

  if (!moduleId || !version) {
    return {
      kind: "error",
      message:
        "Install link is missing moduleId or version. Open the App Store and try Install again.",
    };
  }

  return {
    kind: "ok",
    handoff: { moduleId, version, cert, source },
  };
}

/**
 * Free modules: no cert. Paid modules: offline-verify compact cert against pinned store key (D072).
 */
export async function assertInstallEntitlementReady(handoff: InstallHandoff): Promise<void> {
  if (!handoff.cert) return;
  const { verifyInstallEntitlementCert } = await import("./entitlementCert.js");
  await verifyInstallEntitlementCert(handoff.cert, {
    moduleId: handoff.moduleId,
    version: handoff.version,
  });
}

export function savePendingInstallHandoff(handoff: InstallHandoff): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(handoff));
  } catch {
    /* private mode */
  }
}

export function loadPendingInstallHandoff(): InstallHandoff | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InstallHandoff>;
    if (
      typeof parsed.moduleId !== "string" ||
      !parsed.moduleId.trim() ||
      typeof parsed.version !== "string" ||
      !parsed.version.trim()
    ) {
      return null;
    }
    return {
      moduleId: parsed.moduleId.trim(),
      version: parsed.version.trim(),
      cert: typeof parsed.cert === "string" && parsed.cert.trim() ? parsed.cert.trim() : undefined,
      source:
        typeof parsed.source === "string" && parsed.source.trim()
          ? parsed.source.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function clearPendingInstallHandoff(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function dispatchInstallHandoff(result: InstallHandoffParseOk | InstallHandoffParseError): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<InstallHandoffEventDetail>(INSTALL_HANDOFF_EVENT, {
      detail: { result },
    }),
  );
}

/**
 * Accept an install URL from the address bar, copy-paste, or native deep link.
 * Persists a successful hand-off and notifies the shell (warm start).
 */
export function acceptInstallHandoffUrl(input: string | URL): InstallHandoffParseResult {
  const result = parseInstallHandoff(input);
  if (!result) return null;
  if (result.kind === "ok") {
    savePendingInstallHandoff(result.handoff);
  }
  dispatchInstallHandoff(result);
  return result;
}

/**
 * If the current location is an install hand-off, parse it, persist pending
 * state, and replace the history entry with a clean `/app/` URL.
 */
export function consumeInstallHandoffFromLocation(
  location: Location | URL = window.location,
): InstallHandoffParseResult {
  const href =
    typeof (location as Location).href === "string"
      ? (location as Location).href
      : (location as URL).href;
  const result = parseInstallHandoff(href);
  if (!result) return null;

  if (result.kind === "ok") {
    savePendingInstallHandoff(result.handoff);
  }

  if (typeof window !== "undefined" && window.history?.replaceState) {
    const clean = new URL(window.location.href);
    if (isInstallHandoffUrl(clean)) {
      window.history.replaceState({}, "", "/app/");
    }
  }

  // Location consume runs at shell mount; App also listens for INSTALL_HANDOFF_EVENT
  // from native deep links. Do not double-dispatch here — pending + mount effect covers it.
  return result;
}
