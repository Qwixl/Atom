import { BUSINESS_VERIFICATION_TIER_1_LABEL } from "@qwixl/a2a-transport";
import { verifyDomainControl } from "./domainVerification.js";

export type VerificationRevocationReason =
  | "domain-lapse"
  | "failed-recheck"
  | "fraud"
  | "policy"
  | "manual";

export interface BusinessVerificationRecord {
  tier: number;
  businessDomain: string;
  tierLabel: string;
  verifiedAt: string;
  method: "dns" | "well-known" | "env";
  revoked: boolean;
  revocationReason?: VerificationRevocationReason;
  revokedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class BusinessVerificationStore {
  private record: BusinessVerificationRecord | undefined;

  constructor(
    private readonly agentDid: string,
    private readonly envVerifiedDomain: string | null,
  ) {
    if (envVerifiedDomain?.trim()) {
      this.record = {
        tier: 1,
        businessDomain: envVerifiedDomain.trim().toLowerCase(),
        tierLabel: BUSINESS_VERIFICATION_TIER_1_LABEL,
        verifiedAt: nowIso(),
        method: "env",
        revoked: false,
      };
    }
  }

  get(): BusinessVerificationRecord | undefined {
    if (this.record?.revoked) return undefined;
    return this.record;
  }

  async claim(domain: string): Promise<BusinessVerificationRecord> {
    const normalized = domain.trim().toLowerCase();
    const result = await verifyDomainControl(normalized, this.agentDid);
    if (!result.verified || !result.method) {
      throw new Error(result.error ?? "Domain verification failed");
    }
    this.record = {
      tier: 1,
      businessDomain: normalized,
      tierLabel: BUSINESS_VERIFICATION_TIER_1_LABEL,
      verifiedAt: nowIso(),
      method: result.method,
      revoked: false,
    };
    return this.record;
  }

  async recheck(): Promise<BusinessVerificationRecord | undefined> {
    if (!this.record || this.record.revoked || this.record.method === "env") {
      return this.get();
    }
    const result = await verifyDomainControl(this.record.businessDomain, this.agentDid);
    if (!result.verified) {
      this.revoke("failed-recheck");
      return undefined;
    }
    return this.record;
  }

  revoke(reason: VerificationRevocationReason): BusinessVerificationRecord | undefined {
    if (!this.record) return undefined;
    this.record = {
      ...this.record,
      revoked: true,
      revocationReason: reason,
      revokedAt: nowIso(),
    };
    return this.record;
  }
}
