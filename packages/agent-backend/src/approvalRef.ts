/** Validates shell custody approval references on consequential connector writes (D044). */

const PASSKEY_PREFIX = "passkey:";
const DEV_BYPASS_PREFIX = "dev-bypass:";

export function isValidApprovalRef(
  ref: string | undefined,
  options: { allowDevBypass?: boolean } = {},
): ref is string {
  const trimmed = ref?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(PASSKEY_PREFIX) && trimmed.length > PASSKEY_PREFIX.length + 8) {
    return true;
  }
  if (options.allowDevBypass && trimmed.startsWith(DEV_BYPASS_PREFIX)) {
    return true;
  }
  return false;
}

export function requireApprovalRef(
  ref: string | undefined,
  options: { allowDevBypass?: boolean } = {},
): string {
  if (!isValidApprovalRef(ref, options)) {
    throw new Error("approvalRef required — complete passkey approval in shell Settings");
  }
  return ref.trim();
}

export function allowDevBypassApproval(): boolean {
  return process.env.NODE_ENV !== "production";
}
