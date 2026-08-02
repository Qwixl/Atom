import { bareOwnerHandle } from "../ownerHandle.js";

/** SIGNUP-HANDLE-01 — mirror CP maySetProfileHandle. */
export function maySetProfileHandle(opts: {
  existingHandle: string | null | undefined;
  requestedHandle: string;
}): { ok: true } | { ok: false; code: "handle_immutable" } {
  const existing = (opts.existingHandle ?? "").trim();
  if (!existing) return { ok: true };
  if (bareOwnerHandle(existing) === bareOwnerHandle(opts.requestedHandle)) {
    return { ok: true };
  }
  return { ok: false, code: "handle_immutable" };
}

export function friendlyHandleWriteError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("handle_immutable") || lower.includes("p0001")) {
    return "Your username can’t be changed.";
  }
  if (
    lower.includes("profiles_handle_key") ||
    lower.includes("duplicate key") ||
    lower.includes("already taken")
  ) {
    return "That username is already taken";
  }
  return message;
}

export function buildHandleCheckUrl(opts: {
  controlPlaneBase: string;
  handle: string;
  email: string;
}): string {
  const base = opts.controlPlaneBase.replace(/\/$/, "");
  const params = new URLSearchParams({
    handle: opts.handle,
    email: opts.email.trim().toLowerCase(),
  });
  return `${base}/handles/check?${params.toString()}`;
}
