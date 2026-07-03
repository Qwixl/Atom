import type { DataObject, DataObjectGovernance } from "./types.js";

export function resolveExpiry(
  governance: DataObjectGovernance,
  issuedAt: string,
): Date | undefined {
  if (governance.expiresAt) {
    const absolute = new Date(governance.expiresAt);
    if (Number.isNaN(absolute.getTime())) {
      throw new Error("governance.expiresAt is not a valid ISO 8601 timestamp");
    }
    return absolute;
  }
  if (governance.ttlSeconds !== undefined) {
    if (!Number.isFinite(governance.ttlSeconds) || governance.ttlSeconds < 0) {
      throw new Error("governance.ttlSeconds must be a non-negative number");
    }
    const issued = new Date(issuedAt);
    if (Number.isNaN(issued.getTime())) {
      throw new Error("issuedAt is not a valid ISO 8601 timestamp");
    }
    return new Date(issued.getTime() + governance.ttlSeconds * 1000);
  }
  return undefined;
}

export function isExpired(object: DataObject, now: Date = new Date()): boolean {
  const expiry = resolveExpiry(object.governance, object.issuedAt);
  return expiry !== undefined && now.getTime() >= expiry.getTime();
}

export function isPurposeAllowed(object: DataObject, allowedPurposes: string[]): boolean {
  if (allowedPurposes.length === 0) return true;
  return allowedPurposes.includes(object.governance.purpose);
}

export function assertUsableObject(
  object: DataObject,
  options: { now?: Date; allowedPurposes?: string[] } = {},
): void {
  const now = options.now ?? new Date();
  if (isExpired(object, now)) {
    throw new Error(`Data object ${object.id} expired`);
  }
  const allowed = options.allowedPurposes;
  if (allowed && allowed.length > 0 && !isPurposeAllowed(object, allowed)) {
    throw new Error(
      `Data object ${object.id} purpose "${object.governance.purpose}" not allowed`,
    );
  }
}
